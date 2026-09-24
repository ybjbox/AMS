#!/usr/bin/env node
/**
 * 生产依赖边界守卫（批次 F）。
 *
 * 起因：Dockerfile 的 runner 阶段一直装**全量**依赖，理由写在注释里 —— "server.ts 顶层静态
 * import 了 vite（生产分支跳过但仍需可解析）"。而 dependencies 里 41 个包几乎全是前端/构建期
 * 产物（react、recharts、@tailwindcss/vite…），真正被服务端 import 的只有 9 个，连跑入口用的
 * tsx 都在 devDependencies。于是"生产镜像"其实等价于把整套开发工具链烤进运行时。
 *
 * 本脚本把边界钉成可断言的规则，防止再次漂移：
 *   R1 服务端代码 import 的外部包，必须在 dependencies（否则 --omit=dev 起来就是 ERR_MODULE_NOT_FOUND）
 *   R2 只被前端 import 的包，不得留在 dependencies（否则生产镜像白装）
 *   R3 server.ts 不得静态 import vite（那正是 runner 需要 devDeps 的根因）
 *   R4 tsx 必须在 dependencies（prod CMD / npm start 靠它加载 TS 入口）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const BUILTIN = new Set([
  "fs", "path", "os", "url", "http", "https", "crypto", "stream", "zlib", "buffer", "events",
  "util", "vm", "child_process", "assert", "tty", "process", "querystring", "net", "dns",
  "readline", "worker_threads", "perf_hooks", "timers", "module", "string_decoder", "v8", "sqlite",
]);

function walk(dir, pred) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(rel, pred));
    else if (pred(e.name)) out.push(rel);
  }
  return out;
}

/** 取一个文件里所有"裸"import 的包根（含动态 import()，那才是真运行时依赖） */
function externalsOf(files) {
  const set = new Set();
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const patterns = [/(?:from|import)\s+['"]([^'".][^'"]*)['"]/g, /import\(\s*['"]([^'".][^'"]*)['"]\s*\)/g];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const spec = m[1];
        if (spec.startsWith("node:")) continue;
        const root = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (BUILTIN.has(root)) continue;
        set.add(root);
      }
    }
  }
  return set;
}

const isServerSource = (n) => /\.(ts|mts)$/.test(n) && !n.includes(".test.");
const serverFiles = ["server.ts", ...walk("server", isServerSource)];
const clientFiles = walk("src", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test."));

const serverImports = externalsOf(serverFiles);
const clientImports = externalsOf(clientFiles);

const deps = new Set(Object.keys(pkg.dependencies));
const devDeps = new Set(Object.keys(pkg.devDependencies));

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

/**
 * 只可能走"动态 import + 非生产分支"的包：生产运行时永远不解析它，所以不该占 dependencies。
 * 前提是 R3 成立（服务端入口不得静态 import 它），下面显式复核这一点，不靠约定。
 */
const DEV_ONLY_DYNAMIC = new Set(["vite"]);
const staticallyImported = new Set();
for (const rel of serverFiles) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const m of src.matchAll(/(?:^|\n)\s*import[^;\n]*from\s+['"]([^'".][^'"]*)['"]/g)) {
    const spec = m[1];
    staticallyImported.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
  }
}

// R1
for (const m of [...serverImports].sort()) {
  const devOnlyOk = DEV_ONLY_DYNAMIC.has(m) && !staticallyImported.has(m);
  check(
    deps.has(m) || devOnlyOk,
    `R1 服务端 import 了 ${m}，但它不在 dependencies（--omit=dev 起不来）` +
      (DEV_ONLY_DYNAMIC.has(m) && staticallyImported.has(m) ? `；它被静态 import，dev-only 例外不成立` : "")
  );
}
// R2：只被前端用的包不该占生产依赖
for (const m of [...clientImports].filter((c) => !serverImports.has(c)).sort()) {
  check(!deps.has(m), `R2 ${m} 只被前端 import，却留在 dependencies（生产镜像白装）`);
}
// R3
const serverEntry = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");
check(
  !/^\s*import[^;]*from\s+["']vite["']/m.test(serverEntry),
  "R3 server.ts 顶层静态 import 了 vite —— 会让 runner 必须连开发依赖一起装，应改为 dev 分支内 await import(\"vite\")"
);
// R4
check(deps.has("tsx"), "R4 tsx 不在 dependencies，但 prod CMD / npm start 用它加载 TS 入口");

/**
 * R5：同一个包不能同时出现在 dependencies 与 devDependencies。
 * 真出过事：tsx 被"加进 dependencies"却没从 devDependencies 删掉，npm 于是仍在 lock 里
 * 把它标成 dev —— `npm ci --omit=dev` 直接不装它，镜像在 CMD `node --import tsx` 就崩。
 * 顺带核对 lock 的两段与 package.json 一致（lock 才是 CI 真正安装的清单）。
 */
const dup = [...deps].filter((d) => devDeps.has(d));
check(dup.length === 0, `R5 同时出现在 dependencies 与 devDependencies：${dup.join(", ")}`);
try {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  const lr = lock.packages?.[""] || {};
  const ld = Object.keys(lr.dependencies || {}).sort().join(",");
  const lvd = Object.keys(lr.devDependencies || {}).sort().join(",");
  check(ld === [...deps].sort().join(","), "R5 package-lock 的 root.dependencies 与 package.json 不一致");
  check(lvd === [...devDeps].sort().join(","), "R5 package-lock 的 root.devDependencies 与 package.json 不一致");
  const tsxEntry = lock.packages?.["node_modules/tsx"];
  check(!tsxEntry || !tsxEntry.dev, "R5 lock 把 tsx 标成 dev 依赖，--omit=dev 会不装它");
} catch (e) {
  check(false, `R5 读不到 package-lock.json：${e instanceof Error ? e.message : String(e)}`);
}

const summary = {
  服务端外部依赖: [...serverImports].length,
  dependencies: deps.size,
  devDependencies: devDeps.size,
};

if (failures.length > 0) {
  console.error("生产依赖边界不符：");
  for (const f of failures) console.error("  ✗ " + f);
  console.error(JSON.stringify(summary));
  process.exit(1);
}

console.log(
  `生产依赖边界：服务端需要 ${[...serverImports].join(", ")} —— 全在 dependencies(${deps.size})，` +
    `前端/构建期 ${devDeps.size} 个包已隔离在 devDependencies`
);
console.log("结果：4 条规则全部通过");
