/**
 * P0-2（API 无鉴权 / 假登录）修复验证。
 * 用法：npm run test:auth   （需要 dev server 已在 3000 端口运行）
 *
 * 覆盖：未认证拦截、令牌伪造、暴力破解锁定、用户名枚举、越权、
 *       会话吊销、改密后旧会话失效、强制改密拦截、安全事件留痕。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name} ${extra}`);
  }
}

function section(title) {
  console.log(`\n\x1b[36m${title}\x1b[0m`);
}

async function req(method, url, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function readSeededPassword() {
  const file = path.join(DATA_DIR, "ADMIN_CREDENTIALS.txt");
  if (process.env.AMS_ADMIN_PASSWORD) return process.env.AMS_ADMIN_PASSWORD;
  if (!fs.existsSync(file)) {
    throw new Error(
      `找不到 ${file}。若 accounts 表已存在但凭据文件被删除，请设置 AMS_ADMIN_PASSWORD 或删除 data/ams.db 重新播种。`
    );
  }
  const m = /密码:\s*(\S+)/.exec(fs.readFileSync(file, "utf-8"));
  if (!m) throw new Error("凭据文件格式异常，无法解析密码");
  return m[1];
}

// 需要保护的业务端点样本
const PROTECTED = [
  ["GET", "/api/users"],
  ["GET", "/api/departments"],
  ["GET", "/api/documents"],
  ["GET", "/api/folders"],
  ["GET", "/api/attendance/shifts"],
  ["GET", "/api/export-templates"],
  ["GET", "/api/themes"],
  ["POST", "/api/export-templates"],
  ["POST", "/api/themes"],
  ["DELETE", "/api/export-templates/default_script"],
];

async function main() {
  console.log("\n=== P0-2 鉴权修复验证 ===");

  // ---------------------------------------------------------------- 0. 服务可达
  section("0. 服务可达性");
  const health = await req("GET", "/api/health");
  ok("GET /api/health 无需登录即可访问", health.status === 200, `-> ${health.status}`);

  const adminPassword = readSeededPassword();
  ok("初始管理员密码来自随机生成 / 环境变量", adminPassword.length >= 10, `-> 长度 ${adminPassword.length}`);
  ok(
    "初始密码不是常见弱口令",
    !["123456", "admin", "admin123", "password", "12345678"].includes(adminPassword.toLowerCase()),
    `-> ${adminPassword}`
  );

  // ---------------------------------------------------------------- 1. 未认证一律拦截
  section("1. 未携带凭据时全部业务接口应 401");
  for (const [method, url] of PROTECTED) {
    const r = await req(method, url, { body: method === "GET" ? undefined : {} });
    ok(`${method} ${url} -> 401`, r.status === 401, `-> 实际 ${r.status}`);
  }

  section("2. 伪造 / 畸形令牌");
  for (const bad of ["mock_token_123", "Bearer", "a".repeat(43), "null", "undefined"]) {
    const r = await req("GET", "/api/users", { token: bad });
    ok(`伪造 token "${bad.slice(0, 20)}" 被拒`, r.status === 401, `-> ${r.status}`);
  }
  {
    const r = await req("GET", "/api/users", { headers: { Authorization: "Basic YWRtaW46YWRtaW4=" } });
    ok("Basic 认证头不被接受", r.status === 401, `-> ${r.status}`);
  }

  // ---------------------------------------------------------------- 3. 登录
  section("3. 登录");
  {
    const r = await req("POST", "/api/auth/login", { body: { username: "admin", password: "123456" } });
    ok("旧的 admin/123456 无法登录", r.status === 401, `-> ${r.status}`);
  }
  {
    const r = await req("POST", "/api/auth/login", { body: { username: "admin" } });
    ok("缺少密码返回 400", r.status === 400, `-> ${r.status}`);
  }
  {
    const t0 = Date.now();
    const r = await req("POST", "/api/auth/login", {
      body: { username: "definitely_not_exists_zzz", password: "whatever123" },
    });
    const elapsed = Date.now() - t0;
    ok("不存在的用户名返回与密码错误一致的 401", r.status === 401, `-> ${r.status}`);
    ok(
      "不存在的用户名仍消耗哈希时间（抗用户名枚举）",
      elapsed > 20,
      `-> 仅 ${elapsed}ms，可能未执行 scrypt`
    );
    ok(
      "错误信息不泄漏账号是否存在",
      r.data?.error === "用户名或密码错误",
      `-> ${JSON.stringify(r.data)}`
    );
  }

  const login = await req("POST", "/api/auth/login", {
    body: { username: "admin", password: adminPassword },
  });
  ok("正确凭据登录成功", login.status === 200, `-> ${login.status} ${JSON.stringify(login.data)}`);
  const adminToken = login.data?.token;
  ok("返回了会话 token", typeof adminToken === "string" && adminToken.length >= 40);
  ok("响应中不含密码哈希", !JSON.stringify(login.data).includes("scrypt$"));
  ok("管理员角色为 SUPER_ADMIN", login.data?.user?.systemRole === "SUPER_ADMIN", `-> ${login.data?.user?.systemRole}`);

  const mustChange = !!login.data?.user?.mustChangePassword;
  ok("随机初始密码带 mustChangePassword 标记", mustChange || !!process.env.AMS_ADMIN_PASSWORD);

  // ---------------------------------------------------------------- 4. 强制改密拦截
  if (mustChange) {
    section("4. 强制改密期间只放行 /auth/*");
    const blocked = await req("GET", "/api/users", { token: adminToken });
    ok("未改密时访问业务接口 403", blocked.status === 403, `-> ${blocked.status}`);
    ok("错误码为 PASSWORD_CHANGE_REQUIRED", blocked.data?.code === "PASSWORD_CHANGE_REQUIRED", `-> ${blocked.data?.code}`);
    const me = await req("GET", "/api/auth/me", { token: adminToken });
    ok("但 /auth/me 仍可访问", me.status === 200, `-> ${me.status}`);
  }

  // ---------------------------------------------------------------- 5. 改密
  section("5. 修改密码");
  const NEW_PASSWORD = "VerifyAuth2026x";
  {
    const weak = await req("POST", "/api/auth/change-password", {
      token: adminToken,
      body: { currentPassword: adminPassword, newPassword: "short1" },
    });
    ok("弱密码被拒绝", weak.status === 400, `-> ${weak.status}`);

    const wrong = await req("POST", "/api/auth/change-password", {
      token: adminToken,
      body: { currentPassword: "wrong_password_1", newPassword: NEW_PASSWORD },
    });
    ok("当前密码不正确时拒绝改密", wrong.status === 401, `-> ${wrong.status}`);
  }

  const changed = await req("POST", "/api/auth/change-password", {
    token: adminToken,
    body: { currentPassword: adminPassword, newPassword: NEW_PASSWORD },
  });
  ok("改密成功", changed.status === 200, `-> ${changed.status} ${JSON.stringify(changed.data)}`);
  const freshToken = changed.data?.token;
  ok("改密后下发了新 token", typeof freshToken === "string" && freshToken !== adminToken);

  {
    const old = await req("GET", "/api/auth/me", { token: adminToken });
    ok("改密后旧 token 立即失效", old.status === 401, `-> ${old.status}`);
    const now = await req("GET", "/api/users", { token: freshToken });
    ok("新 token 可正常访问业务接口", now.status === 200, `-> ${now.status}`);
  }

  // ---------------------------------------------------------------- 6. 已认证的正常访问
  section("6. 管理员可正常访问各业务接口");
  for (const [method, url] of PROTECTED.filter(([m]) => m === "GET")) {
    const r = await req(method, url, { token: freshToken });
    ok(`${method} ${url} -> 200`, r.status === 200, `-> ${r.status}`);
  }
  {
    const r = await req("GET", "/api/users", { token: freshToken });
    ok("员工列表确实返回了数据", Array.isArray(r.data) && r.data.length > 0, `-> ${JSON.stringify(r.data).slice(0, 80)}`);
  }

  // ---------------------------------------------------------------- 7. 越权
  section("7. 角色越权拦截");
  const EMP_USER = "verify_employee";
  const EMP_PASS = "EmployeePass99";
  await req("DELETE", `/api/auth/accounts/${EMP_USER}`, { token: freshToken }); // 清理上一轮残留

  const created = await req("POST", "/api/auth/accounts", {
    token: freshToken,
    body: { username: EMP_USER, password: EMP_PASS, systemRole: "EMPLOYEE", displayName: "验证用普通员工" },
  });
  ok("管理员可创建账号", created.status === 201, `-> ${created.status} ${JSON.stringify(created.data)}`);
  ok("创建响应不含密码哈希", !JSON.stringify(created.data).includes("scrypt$"));

  // 新账号带强制改密标记，先改掉才能测越权
  const empLogin = await req("POST", "/api/auth/login", {
    body: { username: EMP_USER, password: EMP_PASS },
  });
  ok("新账号可登录", empLogin.status === 200, `-> ${empLogin.status}`);
  const empChanged = await req("POST", "/api/auth/change-password", {
    token: empLogin.data?.token,
    body: { currentPassword: EMP_PASS, newPassword: "EmployeeNew2026" },
  });
  const empToken = empChanged.data?.token;
  ok("新账号完成初始改密", empChanged.status === 200, `-> ${empChanged.status}`);

  {
    const r = await req("GET", "/api/users", { token: empToken });
    ok("EMPLOYEE 可读员工列表", r.status === 200, `-> ${r.status}`);
  }
  const FORBIDDEN_FOR_EMPLOYEE = [
    ["POST", "/api/users", { name: "越权创建" }],
    ["DELETE", "/api/users/EMP0001", undefined],
    ["PUT", "/api/departments/tree", { departments: [] }],
    ["POST", "/api/themes", { themes: {} }],
    ["GET", "/api/export-templates", undefined],
    ["POST", "/api/export-templates", { name: "evil", code: "x" }],
    ["GET", "/api/auth/accounts", undefined],
    ["POST", "/api/auth/accounts", { username: "escalate", password: "Escalate123" }],
    ["GET", "/api/auth/security-events", undefined],
    ["POST", "/api/export/employees", { data: [], config: { title: "x", columns: [] } }],
  ];
  for (const [method, url, body] of FORBIDDEN_FOR_EMPLOYEE) {
    const r = await req(method, url, { token: empToken, body });
    ok(`EMPLOYEE ${method} ${url} -> 403`, r.status === 403, `-> 实际 ${r.status}`);
  }

  {
    // 越权提权尝试：普通员工改自己的角色
    const r = await req("PUT", `/api/auth/accounts/${EMP_USER}`, {
      token: empToken,
      body: { systemRole: "SUPER_ADMIN" },
    });
    ok("EMPLOYEE 无法给自己提权", r.status === 403, `-> ${r.status}`);
    const check = await req("GET", "/api/auth/me", { token: empToken });
    ok("角色未被篡改", check.data?.user?.systemRole === "EMPLOYEE", `-> ${check.data?.user?.systemRole}`);
  }

  // ---------------------------------------------------------------- 8. 降权即时生效
  section("8. 会话吊销");
  {
    await req("PUT", `/api/auth/accounts/${EMP_USER}`, {
      token: freshToken,
      body: { enabled: false },
    });
    const r = await req("GET", "/api/auth/me", { token: empToken });
    ok("账号被停用后其会话立即失效", r.status === 401, `-> ${r.status}`);
  }

  {
    // 登出
    const relogin = await req("POST", "/api/auth/login", {
      body: { username: "admin", password: NEW_PASSWORD },
    });
    const t = relogin.data?.token;
    const before = await req("GET", "/api/auth/me", { token: t });
    ok("登出前 token 有效", before.status === 200, `-> ${before.status}`);
    await req("POST", "/api/auth/logout", { token: t });
    const after = await req("GET", "/api/auth/me", { token: t });
    ok("登出后 token 立即失效", after.status === 401, `-> ${after.status}`);
  }

  // ---------------------------------------------------------------- 9. 暴力破解锁定
  section("9. 暴力破解防护");
  const BF_USER = "verify_bruteforce";
  await req("DELETE", `/api/auth/accounts/${BF_USER}`, { token: freshToken });
  await req("POST", "/api/auth/accounts", {
    token: freshToken,
    body: { username: BF_USER, password: "BruteForce123", systemRole: "EMPLOYEE" },
  });
  let lockedStatus = 0;
  for (let i = 0; i < 7; i++) {
    const r = await req("POST", "/api/auth/login", {
      body: { username: BF_USER, password: `wrong${i}pass` },
    });
    lockedStatus = r.status;
  }
  ok("连续错误密码后账号被锁定（423）", lockedStatus === 423, `-> 最后一次 ${lockedStatus}`);
  {
    const r = await req("POST", "/api/auth/login", {
      body: { username: BF_USER, password: "BruteForce123" },
    });
    ok("锁定期间即使密码正确也无法登录", r.status === 423, `-> ${r.status}`);
  }

  // ---------------------------------------------------------------- 10. 安全事件留痕
  section("10. 安全事件审计");
  {
    const r = await req("GET", "/api/auth/security-events?limit=500", { token: freshToken });
    ok("管理员可读安全事件", r.status === 200, `-> ${r.status}`);
    const events = Array.isArray(r.data) ? r.data : [];
    const kinds = new Set(events.map((e) => e.event));
    ok("记录了登录成功事件", kinds.has("auth.login_success"));
    ok("记录了登录失败事件", kinds.has("auth.login_failed"));
    ok("记录了越权尝试事件", kinds.has("auth.forbidden"));
    ok("记录了账号创建事件", kinds.has("account.create"));
    ok("事件中不含明文密码", !JSON.stringify(events).includes("BruteForce123"));
  }

  // ---------------------------------------------------------------- 11. 清理
  section("11. 清理测试账号");
  {
    const a = await req("DELETE", `/api/auth/accounts/${EMP_USER}`, { token: freshToken });
    const b = await req("DELETE", `/api/auth/accounts/${BF_USER}`, { token: freshToken });
    ok("测试账号已删除", a.status === 200 && b.status === 200, `-> ${a.status}/${b.status}`);
  }
  {
    const r = await req("DELETE", "/api/auth/accounts/admin", { token: freshToken });
    ok("管理员不能删除自己", r.status === 400, `-> ${r.status}`);
  }

  // 还原管理员密码与「首次需改密」标记，保证脚本可重复执行且回到种子状态
  // 注意：必须用 reset-password（内部 setPassword(..., true) 会置 mustChangePassword=1），
  // 而不能用 change-password（会清掉该标记，导致第 151 行断言在二次运行时误报）。
  const restore = await req("POST", `/api/auth/accounts/admin/reset-password`, {
    token: freshToken,
    body: { newPassword: adminPassword },
  });
  ok("已还原初始管理员密码（脚本可重复运行）", restore.status === 200, `-> ${restore.status}`);

  // ---------------------------------------------------------------- 汇总
  console.log(`\n${"=".repeat(46)}`);
  console.log(`  通过 ${passed} / ${passed + failed}`);
  if (failed > 0) {
    console.log(`\n\x1b[31m失败项：\x1b[0m`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`${"=".repeat(46)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\n\x1b[31m验证脚本异常：\x1b[0m", e);
  process.exit(1);
});
