/**
 * P2-8 回归：入口 zod 校验（替代散落的 `if (!req.body?.name)`）。
 * 自包含：建临时 DATA_DIR → runMigrations + seed admin + 创建 alice
 * → 自起 server（node --import tsx，可真杀）→ 真实 HTTP 验证边界与正常路径。
 *
 * 覆盖：
 *  - 必填缺失 → 统一 400，且响应体为 { error: string }（前端读 response.data.error）
 *  - 字段类型错误（age 传 "abc"、enum 传非法值）→ 400
 *  - 合法 payload（含布尔 / 字符串枚举）→ 2xx
 *  - 校验失败不影响鉴权（用足够权限的 token 测试，确保 400 来自 zod 而非 403）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-validation-"));
process.env.PORT = String(3200 + Math.floor(Math.random() * 800));
process.env.NODE_ENV = "production";
process.env.AMS_ADMIN_PASSWORD = "AdminPass123";
const ADMIN_PW = "AdminPass123";
const ALICE_PW = "Password123";

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const DATA_DIR = process.env.DATA_DIR;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const j = (await r.json()) as any;
  if (j.user?.mustChangePassword) {
    await fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${j.token}` },
      body: JSON.stringify({ currentPassword: password, newPassword: password + "x" }),
    });
    const r2 = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: password + "x" }),
    });
    return (await r2.json()).token;
  }
  return j.token;
}

async function req(method: string, p: string, body?: any, token?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function main() {
  const migrate = await import("../server/migrate.ts");
  migrate.runMigrations();
  const authDb = await import("../server/authDb.ts");
  try {
    authDb.createAccount({
      username: "alice",
      password: ALICE_PW,
      displayName: "Alice",
      systemRole: "EMPLOYEE",
    } as any);
  } catch (e: any) {
    if (!/已存在/.test(e?.message ?? "")) console.log("createAccount warn:", e?.message);
  }

  const server = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write("[srv] " + d));

  const healthy = await waitForHealth();
  ok("服务启动并健康检查通过", healthy);
  if (!healthy) {
    server.kill("SIGKILL");
    throw new Error("server did not start");
  }

  try {
    const adminToken = await login("admin", ADMIN_PW);
    const aliceToken = await login("alice", ALICE_PW);
    ok("admin 登录成功", !!adminToken);
    ok("alice 登录成功", !!aliceToken);

    // 统一错误体形状：{ error: string }
    const isErrorShape = (b: any) => b && typeof b.error === "string" && b.error.length > 0;

    // ---- 员工：name 必填 + 类型校验（需 HR+，用 adminToken）----
    const empNoName = await req("POST", "/api/users", { phone: "13000000000" }, adminToken);
    ok("员工缺 name → 400", empNoName.status === 400, `-> ${empNoName.status}`);
    ok("员工缺 name 错误体为 { error: string }", isErrorShape(empNoName.body));
    ok("员工缺 name 错误信息含「姓名」", /姓名/.test(empNoName.body?.error ?? ""), `-> ${empNoName.body?.error}`);

    const empBadAge = await req("POST", "/api/users", { name: "年龄非法", age: "abc" }, adminToken);
    ok("员工 age 传字符串 → 400", empBadAge.status === 400, `-> ${empBadAge.status}`);
    ok("员工 age 错误体为 { error: string }", isErrorShape(empBadAge.body));

    const empBool = await req(
      "POST",
      "/api/users",
      { name: "布尔字段", hasSocialSecurity: true, isVeteran: false, systemRole: "EMPLOYEE" },
      adminToken
    );
    ok("员工布尔字段 + 字符串枚举 → 201", empBool.status === 201, `-> ${empBool.status}`);

    const empOk = await req("POST", "/api/users", { name: "正常员工", department: "研发部" }, adminToken);
    ok("员工正常创建 → 201", empOk.status === 201, `-> ${empOk.status}`);

    // ---- 待办：title 必填 + type 枚举（EMPLOYEE 即可，用 aliceToken）----
    const todoNoTitle = await req("POST", "/api/todos", { description: "无标题" }, aliceToken);
    ok("待办缺 title → 400", todoNoTitle.status === 400, `-> ${todoNoTitle.status}`);
    ok("待办缺 title 错误信息含「标题」", /标题/.test(todoNoTitle.body?.error ?? ""), `-> ${todoNoTitle.body?.error}`);

    const todoBadType = await req("POST", "/api/todos", { title: "类型非法", type: "bogus" }, aliceToken);
    ok("待办 type 非法枚举 → 400", todoBadType.status === 400, `-> ${todoBadType.status}`);

    const todoOk = await req("POST", "/api/todos", { title: "正常待办", type: "manual" }, aliceToken);
    ok("待办正常创建 → 201", todoOk.status === 201, `-> ${todoOk.status}`);

    // ---- 通知：title 必填 + type 枚举 ----
    const notifNoTitle = await req("POST", "/api/notifications", { message: "无标题" }, aliceToken);
    ok("通知缺 title → 400", notifNoTitle.status === 400, `-> ${notifNoTitle.status}`);

    const notifBadType = await req("POST", "/api/notifications", { title: "类型非法", type: "bogus" }, aliceToken);
    ok("通知 type 非法枚举 → 400", notifBadType.status === 400, `-> ${notifBadType.status}`);

    const notifOk = await req("POST", "/api/notifications", { title: "正常通知", type: "info" }, aliceToken);
    ok("通知正常创建 → 201", notifOk.status === 201, `-> ${notifOk.status}`);

    // ---- 登录：username/password 必填（公开端点）----
    const loginNoPw = await req("POST", "/api/auth/login", { username: "admin" });
    ok("登录缺密码 → 400", loginNoPw.status === 400, `-> ${loginNoPw.status}`);
    ok("登录缺密码错误体为 { error: string }", isErrorShape(loginNoPw.body));

    const loginOk = await req("POST", "/api/auth/login", { username: "admin", password: ADMIN_PW });
    ok("登录正常 → 200", loginOk.status === 200, `-> ${loginOk.status}`);

    // ---- 账号管理：systemRole 枚举（需 ADMIN，用 adminToken）----
    const acctBadRole = await req(
      "POST",
      "/api/auth/accounts",
      { username: "badrole", password: "Password123", systemRole: "GOD" },
      adminToken
    );
    ok("账号创建 systemRole 非法枚举 → 400", acctBadRole.status === 400, `-> ${acctBadRole.status}`);
    ok("账号创建错误体为 { error: string }", isErrorShape(acctBadRole.body));

    const acctOk = await req(
      "POST",
      "/api/auth/accounts",
      { username: "goodrole", password: "Password123", systemRole: "HR" },
      adminToken
    );
    ok("账号创建正常（合法枚举）→ 201", acctOk.status === 201, `-> ${acctOk.status}`);

    const acctUpdateBadRole = await req(
      "PUT",
      "/api/auth/accounts/goodrole",
      { systemRole: "GOD" },
      adminToken
    );
    ok("账号更新 systemRole 非法枚举 → 400", acctUpdateBadRole.status === 400, `-> ${acctUpdateBadRole.status}`);

    // ---- 改密：newPassword 必填 ----
    const cpNoNew = await req(
      "POST",
      "/api/auth/change-password",
      { currentPassword: ALICE_PW },
      aliceToken
    );
    ok("改密缺 newPassword → 400", cpNoNew.status === 400, `-> ${cpNoNew.status}`);

    // ---- 文件夹 / 文档套件：name 必填（需 HR+，用 adminToken）----
    const folderNoName = await req("POST", "/api/folders", { parentId: null }, adminToken);
    ok("文件夹缺 name → 400", folderNoName.status === 400, `-> ${folderNoName.status}`);
    const folderOk = await req("POST", "/api/folders", { name: "验证文件夹" }, adminToken);
    ok("文件夹正常创建 → 201", folderOk.status === 201, `-> ${folderOk.status}`);

    const setNoName = await req("POST", "/api/document-sets", {}, adminToken);
    ok("文档套件缺 name → 400", setNoName.status === 400, `-> ${setNoName.status}`);
    const setOk = await req("POST", "/api/document-sets", { name: "验证套件" }, adminToken);
    ok("文档套件正常创建 → 201", setOk.status === 201, `-> ${setOk.status}`);

    // ---- 文档更新：loose schema 接受任意对象（缺失文档返回 404 证明未被校验拦截）----
    const docUpdateOk = await req("PUT", "/api/documents/nonexistent-id", { name: "x" }, adminToken);
    ok("文档更新合法对象不被校验拦截（404=未找到，非 400）", docUpdateOk.status === 404, `-> ${docUpdateOk.status}`);

    // ---- 反向确认：合法请求确能落库（避免把正常流量也误杀）----
    const listAfter = await req("GET", "/api/users", undefined, adminToken);
    const hasEmp = Array.isArray(listAfter.body) && listAfter.body.some((u: any) => u.name === "正常员工");
    ok("合法员工已写入并可被列表查到", hasEmp);
  } finally {
    server.kill("SIGKILL");
  }
}

main()
  .catch((e) => {
    console.error("脚本异常：", e);
    fail++;
  })
  .finally(() => {
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {}
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail > 0) {
      console.log("失败项：\n - " + fails.join("\n - "));
      process.exit(1);
    }
    process.exit(0);
  });
