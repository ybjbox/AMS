/**
 * 导出脚本模板沙箱安全回归测试（P0-1 RCE 修复的守门脚本）。
 *
 * 前置：先启动开发服务 `npm run dev`（监听 3000）。
 * 运行：`npm run test:sandbox`
 *
 * 覆盖：路径穿越、体积上限、宿主 API 可达性、vm 逃逸链、
 *       模块加载、死循环超时，以及正常模板的功能回归。
 *
 * 说明：P0-2 之后所有 /api 接口都要求登录鉴权，本脚本会自动用
 *       data/ADMIN_CREDENTIALS.txt 里的初始管理员口令登录，
 *       若账号处于「首次登录必须改密」状态则先改一次密，结束前再改回原口令，
 *       保证测试对开发库无副作用、凭据文件始终有效。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const BASE = "http://127.0.0.1:3000";
let TOKEN = "";
let pass = 0;
let fail = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

// ---------------------------------------------------------------- 鉴权引导

function readAdminPassword() {
  const file = path.join(process.cwd(), "data", "ADMIN_CREDENTIALS.txt");
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, "utf8");
    const m = /^密码:\s*(.+)$/m.exec(txt);
    if (m) return m[1].trim();
  }
  if (process.env.AMS_ADMIN_PASSWORD) return process.env.AMS_ADMIN_PASSWORD;
  throw new Error("无法获取管理员密码：请设置 AMS_ADMIN_PASSWORD 或确保 data/ADMIN_CREDENTIALS.txt 存在");
}

function genPassword() {
  // 同时含字母与数字、长度 >=10，通过口令强度校验
  return `Ams${crypto.randomBytes(10).toString("base64url").replace(/[-_]/g, "x")}9`;
}

async function loginAdmin() {
  const originalPassword = readAdminPassword();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: originalPassword }),
  });
  if (!res.ok) throw new Error(`登录失败 HTTP ${res.status}`);
  const body = await res.json();
  let token = body.token;
  let currentPassword = originalPassword;
  let changed = false;

  // 初始管理员口令是随机生成时，首次登录强制改密，否则其余接口会被网关拦下
  if (body.user?.mustChangePassword) {
    const newPassword = genPassword();
    const cp = await fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!cp.ok) throw new Error(`强制改密失败 HTTP ${cp.status}`);
    token = (await cp.json()).token;
    currentPassword = newPassword;
    changed = true;
  }
  return { token, currentPassword, originalPassword, changed };
}

const COLUMNS = [
  { header: "姓名", key: "name" },
  { header: "部门", key: "department" },
  { header: "状态", key: "status" },
];
const DATA = [
  { name: "张三", department: "人事部", status: "在职" },
  { name: "李四", department: "研发部", status: "离职" },
  { name: "王五", department: "研发部", status: "在职" },
];

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
}

async function saveTemplate(name, code) {
  const res = await fetch(`${BASE}/api/export-templates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, code }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function deleteTemplate(name) {
  const res = await fetch(`${BASE}/api/export-templates/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function exportWith(templateName) {
  const res = await fetch(`${BASE}/api/export/employees`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      data: DATA,
      config: {
        title: "员工花名册",
        columns: COLUMNS,
        includeResigned: true,
        mode: "script",
        templateName,
      },
    }),
  });
  if (!res.ok) throw new Error(`export HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.getWorksheet("员工列表");
}

function dumpText(ws) {
  const lines = [];
  ws.eachRow((row) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (c) => vals.push(String(c.value ?? "")));
    lines.push(vals.join("\t"));
  });
  return lines.join("\n");
}

async function main() {
  const { token, currentPassword, originalPassword, changed } = await loginAdmin();
  TOKEN = token;
  console.log("  [auth] 已用管理员账号登录并获得会话 token" + (changed ? "（已通过首次改密）" : ""));

  try {
    console.log("\n=== 1. 路径穿越防护（写入） ===");
    for (const bad of ["../../pwned", "..\\..\\pwned", "/etc/pwned", "a/b", "con:x", "."]) {
      const r = await saveTemplate(bad, "export default async function(){}");
      ok(`拒绝非法模板名 ${JSON.stringify(bad)}`, r.status === 400, `-> ${r.status}`);
    }

    console.log("\n=== 2. 路径穿越防护（删除） ===");
    {
      const r = await deleteTemplate("../../package");
      ok("拒绝穿越式删除", r.status === 400, `-> ${r.status}`);
    }

    console.log("\n=== 3. 体积上限 ===");
    {
      const r = await saveTemplate("oversize", "//" + "x".repeat(70 * 1024));
      ok("拒绝超大模板", r.status === 400, `-> ${r.status}`);
    }

    console.log("\n=== 4. 沙箱能力探测（宿主 API 应全部不可达） ===");
    await saveTemplate(
      "probe_caps",
      `export default async function (ws) {
      ws.addRow(['process=' + (typeof process)]);
      ws.addRow(['require=' + (typeof require)]);
      ws.addRow(['Buffer=' + (typeof Buffer)]);
      ws.addRow(['setTimeout=' + (typeof setTimeout)]);
      ws.addRow(['fetch=' + (typeof fetch)]);
      ws.addRow(['gtProcess=' + (typeof globalThis.process)]);
      ws.addRow(['eval=' + (function(){ try { eval('1'); return 'allowed'; } catch(e){ return 'blocked'; } })()]);
      ws.addRow(['Function=' + (function(){ try { Function('return 1')(); return 'allowed'; } catch(e){ return 'blocked'; } })()]);
    }`
    );
    {
      const ws = await exportWith("probe_caps");
      const text = dumpText(ws);
      for (const expect of [
        "process=undefined",
        "require=undefined",
        "Buffer=undefined",
        "setTimeout=undefined",
        "fetch=undefined",
        "gtProcess=undefined",
        "eval=blocked",
        "Function=blocked",
      ]) {
        ok(expect, text.includes(expect), `\n---\n${text}\n---`);
      }
    }

    console.log("\n=== 5. 经典 vm 逃逸链（constructor.constructor） ===");
    await saveTemplate(
      "probe_escape",
      `export default async function (ws, data, config) {
      var got = 'no-escape';
      try { got = 'ESCAPED:' + ws.constructor.constructor('return process')().pid; } catch (e) { got = 'blocked:' + e.name; }
      try { got += '|' + ({}).constructor.constructor('return process.env.PATH')().slice(0,5); } catch (e) { got += '|blocked2'; }
      try { got += '|' + data.constructor.constructor('return process')().version; } catch (e) { got += '|blocked3'; }
      ws.addRow([got]);
    }`
    );
    {
      const ws = await exportWith("probe_escape");
      const text = dumpText(ws);
      ok("未逃逸出沙箱", !text.includes("ESCAPED:"), `\n---\n${text}\n---`);
      ok("三条逃逸链全部被拦截", text.includes("blocked") && text.includes("blocked2") && text.includes("blocked3"), `\n${text}`);
    }

    console.log("\n=== 6. 文件读取 / 模块加载 ===");
    await saveTemplate(
      "probe_fs",
      `export default async function (ws) {
      var r = 'none';
      try { const m = await import('node:fs'); r = 'IMPORTED'; } catch (e) { r = 'blocked'; }
      ws.addRow([r]);
    }`
    );
    {
      const ws = await exportWith("probe_fs");
      const text = dumpText(ws);
      ok("动态 import 被拒绝（模板整体拒绝执行）", !text.includes("IMPORTED"), `\n${text}`);
      ok("给出可读的失败提示", text.includes("脚本执行失败"), `\n${text}`);
    }

    console.log("\n=== 7. 死循环不会拖死服务 ===");
    {
      const t0 = Date.now();
      await saveTemplate("probe_loop", `export default async function (ws) { while (true) {} }`);
      const ws = await exportWith("probe_loop");
      const cost = Date.now() - t0;
      const text = dumpText(ws);
      ok(`死循环被超时中断（耗时 ${cost}ms < 15s）`, cost < 15000, `-> ${cost}ms`);
      ok("导出仍然返回了可用文件", text.includes("脚本执行失败"), `\n${text}`);
      const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
      ok("服务依然存活", health.status === "ok");
    }

    console.log("\n=== 8. 正常模板功能未被破坏（default_script） ===");
    {
      const ws = await exportWith("default_script");
      const text = dumpText(ws);
      ok("标题行存在", ws.getRow(1).getCell(1).value === "员工花名册", `-> ${ws.getRow(1).getCell(1).value}`);
      ok("标题行已合并", ws.getRow(1).getCell(1).isMerged === true);
      ok("标题字号 22 生效", ws.getRow(1).getCell(1).font?.size === 22, JSON.stringify(ws.getRow(1).getCell(1).font));
      ok("标题行高 45 生效", ws.getRow(1).height === 45, `-> ${ws.getRow(1).height}`);
      ok("表头在第 2 行", ws.getRow(2).getCell(1).value === "姓名", `-> ${ws.getRow(2).getCell(1).value}`);
      ok("表头蓝色填充生效", ws.getRow(2).getCell(1).fill?.fgColor?.argb === "FF3B82F6", JSON.stringify(ws.getRow(2).getCell(1).fill));
      ok("数据行数正确（3 条）", ws.rowCount === 5, `-> rowCount=${ws.rowCount}`);
      // 注意：xlsx 格式不保存列 key，重新加载后只能按列序号取单元格（name 是第 1 列）
      ok("张三在第 3 行", ws.getRow(3).getCell(1).value === "张三", `-> ${ws.getRow(3).getCell(1).value}`);
      ok(
        "人事部浅绿底色规则生效",
        ws.getRow(3).getCell(1).fill?.fgColor?.argb === "FFF0FDF4",
        JSON.stringify(ws.getRow(3).getCell(1).fill)
      );
      ok(
        "研发部不应有浅绿底色",
        ws.getRow(4).getCell(2).fill?.fgColor?.argb !== "FFF0FDF4",
        JSON.stringify(ws.getRow(4).getCell(2).fill)
      );
      // getCell('name') 这条按列名取单元格的路径，服务端回放时必须正确解析到第 1 列
      ok(
        "离职红色斜体规则生效（按列名 key 取单元格）",
        ws.getRow(4).getCell(1).font?.italic === true &&
          ws.getRow(4).getCell(1).font?.color?.argb === "FFFF0000",
        JSON.stringify(ws.getRow(4).getCell(1).font)
      );
      ok(
        "在职员工不应被标红",
        ws.getRow(5).getCell(1).font?.color?.argb !== "FFFF0000",
        JSON.stringify(ws.getRow(5).getCell(1).font)
      );
      ok("单元格边框生效", ws.getRow(5).getCell(1).border?.top?.style === "thin", JSON.stringify(ws.getRow(5).getCell(1).border));
    }

    console.log("\n=== 9. 清理测试模板 ===");
    for (const n of ["probe_caps", "probe_escape", "probe_fs", "probe_loop"]) {
      const r = await deleteTemplate(n);
      ok(`删除 ${n}`, r.status === 200, `-> ${r.status}`);
    }
    {
      const list = await fetch(`${BASE}/api/export-templates`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
      ok(
        "仅保留 default_script",
        list.length === 1 && list[0].name === "default_script",
        JSON.stringify(list.map((t) => t.name))
      );
    }

    console.log(`\n========== ${pass} passed / ${fail} failed ==========\n`);
  } finally {
    // 把口令改回凭据文件里的值，保证开发库无副作用、凭据文件始终有效。
    //
    // 必须用 reset-password 而不是 change-password：前者内部走 setPassword(..., true)，
    // 会把 mustChangePassword 重新置 1，完整还原种子态；后者会清掉该标记，
    // 导致随后运行的 verify-auth.mjs 里「随机初始密码带 mustChangePassword 标记」误报失败。
    if (changed && currentPassword !== originalPassword) {
      try {
        await fetch(`${BASE}/api/auth/accounts/admin/reset-password`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ newPassword: originalPassword }),
        });
        console.log("  [auth] 已把管理员口令与首次改密标记恢复为种子态");
      } catch (e) {
        console.warn("  [auth] 恢复口令失败（不影响测试结果）:", e.message);
      }
    }
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify crashed:", e);
  process.exit(1);
});
