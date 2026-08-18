/**
 * P2-4 回归：base64 上传内存放大修复（流式 multipart/二进制上传）。
 *
 * 修复前：文件以 base64 塞进 JSON body（json({limit:"50mb"})），
 *   50MB → base64 ~67MB + JSON.parse + Buffer，峰值内存 > 200MB，3 并发即 OOM。
 * 修复后：POST /api/documents/upload 直接接收原始二进制请求体，
 *   req.pipe(writeStream) 边收边落盘，内存只持有流分片，与文件大小无关；
 *   且不再有 50MB 的 JSON body 上限。
 *
 * 本脚本自起一个临时 DATA_DIR 的 server（临时端口），真实发起 HTTP 上传，
 * 验证：小文件流式落盘且内容完好、超大文件（>50MB）也能成功（证明无 50MB 上限）、
 * 缺 name 返回 400、旧的 base64 端点已移除（POST /api/documents 返回 404）。
 *
 * 运行：npm run test:upload-stream（需本机可启动 tsx server.ts）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// 测试用固定 admin 口令：走文档支持的 AMS_ADMIN_PASSWORD 路径，
// 免去读取随机凭据文件，且 mustChangePassword=0（不会触发改密期 403）。
// 注意：避免 ! 等字符——Windows cmd（shell:true）会将其当作延迟展开符号吃掉。
const ADMIN_PW = "UploadVerifyTemp123";

const PORT = Number(process.env.UPLOAD_TEST_PORT) || 3200 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-upload-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.NODE_ENV = "production"; // 跳过 vite 中间件，纯 API 测试更快
process.env.AMS_ADMIN_PASSWORD = ADMIN_PW;

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name + (extra ? ` -> ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? " -> " + extra : ""}`);
  }
}

function resolveTsx() {
  // 用 `node --import tsx` 直接加载 server.ts（无 shell:true），
  // 这样 server.kill() 能真正杀掉 node 进程，不留孤儿占用端口。
  const p = path.resolve("node_modules/tsx");
  return fs.existsSync(p) ? "tsx" : "tsx";
}

function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) return resolve(true);
      } catch {
        /* 还没起来 */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("server health timeout"));
      setTimeout(tick, 300);
    };
    tick();
  });
}

const server = spawn(process.execPath, ["--import", resolveTsx(), "server.ts"], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverErr = "";
server.stderr.on("data", (d) => (serverErr += d.toString()));

async function req(method, urlPath, body, token, headers = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: h,
    body: body !== undefined ? body : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, text };
}

async function listDocCount(token) {
  const r = await req("GET", "/api/documents", undefined, token);
  if (Array.isArray(r.body)) return r.body.length;
  if (r.body && typeof r.body.total === "number") return r.body.total;
  return -1;
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function main() {
  await waitForHealth();

  // 用固定口令登录（AMS_ADMIN_PASSWORD 已设置，mustChangePassword=0）
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: ADMIN_PW }),
  });
  const loginJson = await login.json();
  const TOKEN = loginJson.token;
  ok("管理员登录成功（获取 Bearer token）", !!TOKEN, `status ${login.status}`);
  ok("新库初始文档数为 0（确认临时 DATA_DIR 隔离生效）", (await listDocCount(TOKEN)) === 0);

  // ---- 1. 小文件流式上传 + 内容完好 ----
  const small = Buffer.from("AMS 文档流式上传回归测试 — hello world 🚀");
  const smallName = "回归-small-测试.txt";
  const r1 = await req(
    "POST",
    `/api/documents/upload?name=${encodeURIComponent(smallName)}`,
    small,
    TOKEN,
    { "Content-Type": "application/octet-stream" }
  );
  ok("小文件流式上传返回 201", r1.status === 201, `status ${r1.status}`);
  ok("返回文档含 id / size / storedPath", !!r1.body?.id && typeof r1.body?.size === "number");
  ok("返回 size 等于原始字节数", r1.body?.size === small.length, `got ${r1.body?.size}`);
  const id1 = r1.body?.id;

  // 下载回来比对 sha256，确认流未损坏
  const dl1 = await req("GET", `/api/files/${id1}?access_token=${TOKEN}`, undefined, TOKEN);
  ok("下载小文件返回 200", dl1.status === 200, `status ${dl1.status}`);
  const dl1Buf = Buffer.from(await (await fetch(`${BASE}/api/files/${id1}?access_token=${TOKEN}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })).arrayBuffer());
  ok("下载内容 sha256 与上传一致", sha256(dl1Buf) === sha256(small), `${sha256(dl1Buf)} vs ${sha256(small)}`);

  // ---- 2. 超大文件（>50MB）流式上传成功：证明旧的 50MB JSON 上限已去除 ----
  const BIG = 51 * 1024 * 1024; // 51 MiB，超过旧 json({limit:"50mb"}) 上限
  const big = crypto.randomBytes(BIG);
  const bigName = "回归-big.bin";
  const r2 = await req(
    "POST",
    `/api/documents/upload?name=${encodeURIComponent(bigName)}`,
    big,
    TOKEN,
    { "Content-Type": "application/octet-stream" }
  );
  ok("51MB 大文件流式上传返回 201（无 50MB 上限）", r2.status === 201, `status ${r2.status}`);
  ok("返回 size 等于 51MiB", r2.body?.size === BIG, `got ${r2.body?.size}`);
  ok("大文件上传后服务仍健康（未 OOM 崩溃）", (await fetch(`${BASE}/api/health`)).ok);
  const id2 = r2.body?.id;

  // 大文件下载回来比对 sha256，确认 51MB 流完整
  const dl2Buf = Buffer.from(await (await fetch(`${BASE}/api/files/${id2}?access_token=${TOKEN}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })).arrayBuffer());
  ok("大文件下载内容 sha256 与上传一致", sha256(dl2Buf) === sha256(big), `len ${dl2Buf.length}`);

  // ---- 3. 缺 name 返回 400 ----
  const r3 = await req(
    "POST",
    `/api/documents/upload`,
    Buffer.from("x"),
    TOKEN,
    { "Content-Type": "application/octet-stream" }
  );
  ok("缺 name 参数返回 400", r3.status === 400, `status ${r3.status}`);

  // ---- 4. 旧的 base64 上传端点已移除（POST /api/documents 不再接受 contentBase64）----
  const r4 = await req(
    "POST",
    `/api/documents`,
    { name: "legacy.bin", contentBase64: "AAAA" },
    TOKEN,
    { "Content-Type": "application/json" }
  );
  ok("旧 base64 上传端点已移除（返回 404）", r4.status === 404, `status ${r4.status}`);

  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
  if (fail > 0) {
    console.error("失败项：\n - " + failures.join("\n - "));
  }
}

main()
  .catch((e) => {
    console.error("脚本异常：", e);
    if (serverErr) console.error("server stderr:\n", serverErr);
    fail++;
  })
  .finally(() => {
    try { server.kill("SIGKILL"); } catch { /* ignore */ }
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(fail > 0 ? 1 : 0);
  });
