/**
 * 导出脚本模板沙箱 Worker。
 *
 * 威胁模型：模板代码来自 HTTP 请求，必须视为完全不可信的攻击者输入。
 *
 * 隔离手段（逐层）：
 * 1. 独立 Worker 线程 + resourceLimits —— 主线程可随时 terminate，内存有上限。
 * 2. vm.createContext 全新 realm —— 沙箱内没有 require / process / Buffer /
 *    setTimeout / fetch，只有 ECMAScript 标准内置对象。
 * 3. codeGeneration: { strings: false, wasm: false } —— 沙箱内 eval / new Function /
 *    WebAssembly 全部失效。
 * 4. 关键：**不向沙箱传入任何宿主对象**。worksheet 录制器、console 桩全部在沙箱
 *    源码内定义；data/config 以 JSON 字符串（原始值）传入后在沙箱内 JSON.parse。
 *    因此不存在 `hostObj.constructor.constructor('return process')()` 这条经典逃逸链。
 * 5. 结果同样只通过原始值回传（JSON 字符串），主线程不会去 await 沙箱的 thenable，
 *    避免宿主 resolve/reject 函数泄漏进沙箱。
 */

import { parentPort, workerData } from "node:worker_threads";
import vm from "node:vm";

const { code, dataJson, configJson, maxOps, syncTimeoutMs, totalTimeoutMs } = workerData;

/** 沙箱内的录制器源码。注意：此处不能出现反引号与 ${}，保持为纯 ES5-ish 语法。 */
const RECORDER_SOURCE = `
'use strict';

var __default = null;
var __ops = [];
var __logs = [];
var __rowSeq = 0;
var __cellSeq = 0;
var __colCount = 0;
var __rowMeta = [];
var __columnsVal = [];
var __done = false;
var __result = null;
var __error = null;
var __MAX_OPS = __MAXOPS__;

function __clone(v) {
  if (v === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    return null;
  }
}

function __push(op) {
  if (__ops.length >= __MAX_OPS) {
    throw new Error('模板产生的操作数超出上限（' + __MAX_OPS + '），已中止');
  }
  __ops.push(op);
}

function __log() {
  if (__logs.length >= 200) return;
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    try { parts.push(String(arguments[i])); } catch (e) { parts.push('[unprintable]'); }
  }
  __logs.push(parts.join(' ').slice(0, 500));
}
var console = { log: __log, info: __log, warn: __log, error: __log, debug: __log };

var CELL_PROPS = ['value', 'font', 'fill', 'alignment', 'border', 'numFmt', 'style', 'note'];
var ROW_PROPS = ['height', 'font', 'fill', 'alignment', 'border', 'hidden', 'outlineLevel'];
var COL_PROPS = ['width', 'hidden', 'outlineLevel', 'numFmt', 'font', 'alignment', 'style'];

function __clampInt(n, min, max, fallback) {
  var v = parseInt(n, 10);
  if (isNaN(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function __defineRecorded(target, props, emit) {
  props.forEach(function (p) {
    var cached;
    Object.defineProperty(target, p, {
      enumerable: true,
      configurable: false,
      get: function () { return cached; },
      set: function (v) { cached = v; emit(p, v); }
    });
  });
}

function __mkCell(rowId, key) {
  var cellId = 'c' + (++__cellSeq);
  __push({ op: 'getCell', cellId: cellId, rowId: rowId, key: __clone(key) });
  var cell = {};
  __defineRecorded(cell, CELL_PROPS, function (prop, v) {
    __push({ op: 'setCellProp', cellId: cellId, prop: prop, value: __clone(v) });
  });
  return cell;
}

function __mkRow(rowId, cellCount) {
  var row = {};
  __defineRecorded(row, ROW_PROPS, function (prop, v) {
    __push({ op: 'setRowProp', rowId: rowId, prop: prop, value: __clone(v) });
  });
  row.getCell = function (k) { return __mkCell(rowId, k); };
  row.eachCell = function (a, b) {
    var cb = typeof a === 'function' ? a : b;
    if (typeof cb !== 'function') return;
    for (var i = 1; i <= cellCount; i++) cb(__mkCell(rowId, i), i);
  };
  row.commit = function () {};
  return row;
}

var worksheet = {
  get columns() { return __columnsVal; },
  set columns(v) {
    __columnsVal = __clone(v) || [];
    __colCount = __columnsVal.length;
    __push({ op: 'setColumns', columns: __columnsVal });
    if (__rowMeta.length === 0) __rowMeta.push({ cellCount: __colCount });
  },
  get rowCount() { return __rowMeta.length; },
  get columnCount() { return __colCount; },
  addRow: function (v) {
    var id = 'r' + (++__rowSeq);
    var val = __clone(v);
    __push({ op: 'addRow', rowId: id, value: val });
    var cc = Object.prototype.toString.call(val) === '[object Array]'
      ? Math.max(val.length, __colCount)
      : __colCount;
    __rowMeta.push({ cellCount: cc });
    return __mkRow(id, cc);
  },
  addRows: function (arr) {
    var out = [];
    if (arr && typeof arr.length === 'number') {
      for (var i = 0; i < arr.length; i++) out.push(worksheet.addRow(arr[i]));
    }
    return out;
  },
  insertRow: function (pos, v) {
    var id = 'r' + (++__rowSeq);
    var val = __clone(v);
    var p = __clampInt(pos, 1, 1048576, 1);
    __push({ op: 'insertRow', rowId: id, pos: p, value: val });
    var cc = Object.prototype.toString.call(val) === '[object Array]' ? val.length : __colCount;
    __rowMeta.splice(p - 1, 0, { cellCount: cc });
    return __mkRow(id, cc);
  },
  getRow: function (n) {
    var num = __clampInt(n, 1, 1048576, 1);
    var id = 'r' + (++__rowSeq);
    __push({ op: 'getRow', rowId: id, number: num });
    while (__rowMeta.length < num) __rowMeta.push({ cellCount: __colCount });
    var meta = __rowMeta[num - 1];
    return __mkRow(id, meta ? meta.cellCount : __colCount);
  },
  eachRow: function (a, b) {
    var cb = typeof a === 'function' ? a : b;
    if (typeof cb !== 'function') return;
    var total = __rowMeta.length;
    for (var i = 1; i <= total; i++) cb(worksheet.getRow(i), i);
  },
  mergeCells: function () {
    var args = [];
    for (var i = 0; i < arguments.length; i++) args.push(__clone(arguments[i]));
    __push({ op: 'mergeCells', args: args });
  },
  getColumn: function (k) {
    var key = __clone(k);
    var col = {};
    __defineRecorded(col, COL_PROPS, function (prop, v) {
      __push({ op: 'setColumnProp', key: key, prop: prop, value: __clone(v) });
    });
    return col;
  },
  commit: function () {}
};
`;

const DRIVER_SOURCE = `
;(function () {
  var __data, __config;
  try {
    __data = JSON.parse(__dataJson);
    __config = JSON.parse(__configJson);
  } catch (e) {
    __error = '沙箱数据解析失败: ' + String(e && e.message || e);
    __done = true;
    return;
  }
  Promise.resolve()
    .then(function () {
      var fn = null;
      if (typeof __default === 'function') fn = __default;
      else if (typeof applyTemplate === 'function') fn = applyTemplate;
      if (!fn) throw new Error('模板必须使用 export default 导出一个函数');
      return fn(worksheet, __data, __config);
    })
    .then(
      function () {
        try {
          __result = JSON.stringify({ ops: __ops, logs: __logs });
        } catch (e) {
          __error = '模板产出的数据无法序列化: ' + String(e && e.message || e);
        }
        __done = true;
      },
      function (e) {
        __error = String((e && e.message) || e);
        __done = true;
      }
    );
})();
`;

/**
 * 把注释与字符串字面量替换成等长空白，用于「只在真实代码上做模式匹配」。
 * 长度与偏移量逐字符保持一致，因此可以直接把匹配位置映射回原始源码。
 */
function scrubLiterals(src) {
  let out = "";
  let state = "code"; // code | line | block | sq | dq | tpl
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { state = "sq"; out += " "; i += 1; continue; }
      if (c === '"') { state = "dq"; out += " "; i += 1; continue; }
      if (c === "`") { state = "tpl"; out += " "; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += "\n"; } else { out += " "; }
      i += 1; continue;
    }
    if (state === "block") {
      if (c === "*" && d === "/") { state = "code"; out += "  "; i += 2; }
      else { out += c === "\n" ? "\n" : " "; i += 1; }
      continue;
    }
    // 字符串内部
    if (c === "\\") { out += "  "; i += 2; continue; }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
      state = "code"; out += " "; i += 1; continue;
    }
    out += c === "\n" ? "\n" : " ";
    i += 1;
  }
  return out;
}

/**
 * 把 ESM 的 `export default` 改写为对 __default 的赋值，使其可在 vm.Script 中运行。
 *
 * import / require 的拒绝只是「提前给出可读错误」，不是安全边界本身：
 * vm.Script 里 import 声明本就是 SyntaxError，动态 import 因未提供
 * importModuleDynamically 回调也会直接失败，require 在沙箱里根本不存在。
 * 因此这里的匹配一律基于剥离注释/字符串后的源码，避免误伤 JSDoc 里的
 * `@param {import('exceljs').Worksheet}` 这类写法。
 */
function transformModuleSyntax(src) {
  const scrubbed = scrubLiterals(src);

  if (/^[ \t]*import[\s{*]/m.test(scrubbed) || /\bimport\s*\(/.test(scrubbed)) {
    throw new Error("模板脚本中不允许使用 import");
  }
  if (/\brequire\s*\(/.test(scrubbed)) {
    throw new Error("模板脚本中不允许使用 require");
  }

  // 在 scrubbed 上一次性收集所有需要改写的区间，再倒序应用到原始源码，
  // 这样不同替换之间不会互相干扰偏移量。
  const edits = [];

  const defaultMatch = /^[ \t]*export[ \t]+default[ \t]+/m.exec(scrubbed);
  if (defaultMatch) {
    edits.push({
      start: defaultMatch.index,
      end: defaultMatch.index + defaultMatch[0].length,
      text: "__default = ",
    });
  }

  const namedRe = /^[ \t]*export[ \t]+(?=(?:const|let|var|function|async|class)\b)/gm;
  let m;
  while ((m = namedRe.exec(scrubbed)) !== null) {
    const start = m.index;
    // 与 export default 区间重叠的不重复处理
    if (defaultMatch && start === defaultMatch.index) continue;
    edits.push({ start, end: start + m[0].length, text: "" });
  }

  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }

  return out;
}

function fail(message) {
  parentPort.postMessage({ ok: false, error: message });
}

async function main() {
  if (typeof code !== "string" || code.trim().length === 0) {
    return fail("模板代码为空");
  }

  let transformed;
  try {
    transformed = transformModuleSyntax(code);
  } catch (e) {
    return fail(e.message);
  }

  // 沙箱全局对象：只挂载原始字符串，不挂载任何宿主对象/函数
  const sandbox = Object.create(null);
  sandbox.__dataJson = String(dataJson);
  sandbox.__configJson = String(configJson);

  const context = vm.createContext(sandbox, {
    name: "excel-template-sandbox",
    codeGeneration: { strings: false, wasm: false },
  });

  const program =
    RECORDER_SOURCE.replace("__MAXOPS__", String(maxOps)) +
    "\n" +
    transformed +
    "\n" +
    DRIVER_SOURCE;

  try {
    vm.runInContext(program, context, {
      filename: "export-template.js",
      timeout: syncTimeoutMs,
      displayErrors: true,
    });
  } catch (e) {
    return fail("模板执行失败: " + String((e && e.message) || e));
  }

  // 轮询等待沙箱内异步流程结束。只读取原始值，绝不 await 沙箱的 thenable。
  const deadline = Date.now() + totalTimeoutMs;
  for (;;) {
    let done;
    try {
      done = vm.runInContext("__done === true", context, { timeout: 200 });
    } catch {
      return fail("模板执行超时或状态异常");
    }
    if (done === true) break;
    if (Date.now() > deadline) return fail("模板执行超时");
    await new Promise((r) => setTimeout(r, 2));
  }

  let sandboxError;
  let resultJson;
  try {
    sandboxError = vm.runInContext('typeof __error === "string" ? __error : null', context, {
      timeout: 200,
    });
    resultJson = vm.runInContext('typeof __result === "string" ? __result : null', context, {
      timeout: 200,
    });
  } catch (e) {
    return fail("读取模板执行结果失败");
  }

  if (typeof sandboxError === "string" && sandboxError.length > 0) {
    return fail(sandboxError.slice(0, 500));
  }
  if (typeof resultJson !== "string") {
    return fail("模板未产生有效结果");
  }
  if (resultJson.length > 32 * 1024 * 1024) {
    return fail("模板产出的数据过大");
  }

  parentPort.postMessage({ ok: true, payload: resultJson });
}

main().catch((e) => fail("沙箱内部错误: " + String((e && e.message) || e)));
