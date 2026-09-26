/**
 * P0-2（API 无鉴权 / 假登录）修复验证 + 批次 1 的角色天花板。
 *
 * 运行：node scripts/verify-auth.mjs（也包含在 npm run test:server 里）
 *
 * 覆盖：未认证拦截、令牌伪造、暴力破解锁定、用户名枚举、越权、会话吊销、
 *       改密后旧会话失效、强制改密拦截、安全事件留痕、**低秩管理员管不到高秩账号**。
 *
 * 自起私有实例（临时 DATA_DIR + 随机端口）。这里刻意**不**预设 AMS_ADMIN_PASSWORD：
 * 让服务端走「随机口令 + ADMIN_CREDENTIALS.txt」那条播种路径，才能验到
 * mustChangePassword=1 期间的放行面（预设口令的账号是不带该标记的）。
 */
import fs from "node:fs";
import path from "node:path";
import { bootServer, summarize } from "./lib/liveServer.mjs";

let BASE = "";
let DATA = "";

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
  const file = path.join(DATA, "ADMIN_CREDENTIALS.txt");
  if (!fs.existsSync(file)) {
    throw new Error(`随机管理员口令文件未出现：${file}（播种路径异常，无法验证 mustChangePassword 放行面）`);
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
  const booted = await bootServer({ tag: "auth", seedAdminPassword: null, autoLogin: false });
  BASE = booted.base;
  DATA = booted.dataDir;
  const { stop } = booted;
  try {
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
    // 不把口令值打到日志里：这次是随临时目录一起消失的一次性口令，
    // 但"顺手把口令 print 出来"这个习惯在别的脚本里就是泄露源
    `-> 长度 ${adminPassword.length}`
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
  // 本脚本不再预设 AMS_ADMIN_PASSWORD，所以这里必须是 true；
  // 曾经是 `mustChange || !!process.env.AMS_ADMIN_PASSWORD` —— 那会让第 4 节在CI上整段静默跳过
  ok("随机初始口令带 mustChangePassword 标记", mustChange);

  // ---------------------------------------------------------------- 4. 强制改密拦截
  {
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
  await req("DELETE", `/api/auth/accounts/${EMP_USER}`, { token: freshToken }); // 防御：万一前一次跑到这里就中断了

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
  // 用户名是全站唯一的归属键（approvals.applicant / todos.assignee / saved_items.owner /
  // ai_* 都用它），删掉账号后同名重建会让新人直接继承上一个人的待办、审批余额和 API Key。
  {
    const again = await req("POST", "/api/auth/accounts", {
      token: freshToken,
      body: { username: EMP_USER, password: EMP_PASS, systemRole: "EMPLOYEE" },
    });
    ok("已删除的用户名不能复用（409）", again.status === 409, `-> ${again.status}`);
    ok("复用被拒时给出可读原因", /不能复用/.test(again.data?.error ?? ""), `-> ${JSON.stringify(again.data)}`);
    const other = await req("POST", "/api/auth/accounts", {
      token: freshToken,
      body: { username: `${EMP_USER}_b`, password: EMP_PASS, systemRole: "EMPLOYEE" },
    });
    ok("换一个用户名仍可创建", other.status === 201, `-> ${other.status}`);
    await req("DELETE", `/api/auth/accounts/${EMP_USER}_b`, { token: freshToken });
  }

  // ---------------------------------------------------------------- 12. 角色天花板（真网关 + 真会话）
  // server/tests/account-role-ceiling.test.ts 用 mock 身份直连 handler；这一节补的是
  // 「过完整 authGate 的真实会话」也拦得住 —— 那是批次 1 那个 blocker 的实际形态：
  // 管理员改一次超管口令，就能以超管身份登录。
  section("12. 角色天花板：管理员碰不到超管");
  {
    const CEIL_USER = "verify_ceiling_admin";
    const CEIL_PASS = "CeilingAdmin2026a";
    const mk = await req("POST", "/api/auth/accounts", {
      token: freshToken,
      body: { username: CEIL_USER, password: CEIL_PASS, systemRole: "ADMIN" },
    });
    ok("超管可创建管理员账号", mk.status === 201, `-> ${mk.status}`);
    const cLogin = await req("POST", "/api/auth/login", { body: { username: CEIL_USER, password: CEIL_PASS } });
    const cChanged = await req("POST", "/api/auth/change-password", {
      token: cLogin.data?.token,
      body: { currentPassword: CEIL_PASS, newPassword: "CeilingAdmin2026b" },
    });
    const adminRoleToken = cChanged.data?.token;
    ok("管理员探针账号已可用", !!adminRoleToken, `-> ${cChanged.status}`);

    const reset = await req("POST", "/api/auth/accounts/admin/reset-password", {
      token: adminRoleToken,
      body: { newPassword: "StolenByAdmin2026a" },
    });
    ok("ADMIN 重置超管口令 → 403", reset.status === 403, `-> ${reset.status}`);
    const disable = await req("PUT", "/api/auth/accounts/admin", { token: adminRoleToken, body: { enabled: false } });
    ok("ADMIN 停用超管 → 403", disable.status === 403, `-> ${disable.status}`);
    const del = await req("DELETE", "/api/auth/accounts/admin", { token: adminRoleToken });
    ok("ADMIN 删除超管 → 403", del.status === 403, `-> ${del.status}`);
    // 备份文件是含口令哈希与各类凭据的整库副本：连下载都只给超管
    const exportRes = await req("GET", "/api/backup/export/whatever.db", { token: adminRoleToken });
    ok("ADMIN 下载备份 → 403（只有超管能取走整库副本）", exportRes.status === 403, `-> ${exportRes.status}`);
    const superStillWorks = await req("POST", "/api/auth/login", {
      body: { username: "admin", password: NEW_PASSWORD },
    });
    ok("超管账号未被动过（新口令仍可登录）", superStillWorks.status === 200, `-> ${superStillWorks.status}`);

    await req("DELETE", `/api/auth/accounts/${CEIL_USER}`, { token: freshToken });
  }

  // ---------------------------------------------------------------- 汇总
  } finally {
    // 私有实例跑完即拆：不需要"把 admin 还原成种子态"这类收尾
    await stop();
  }
  console.log(`\n${"=".repeat(46)}`);
  console.log(`  通过 ${passed} / ${passed + failed}`);
  if (failed > 0) {
    console.log(`\n\x1b[31m失败项：\x1b[0m`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`${"=".repeat(46)}\n`);
  process.exit(summarize({ pass: passed, fail: failed, failures }));
}

main().catch((e) => {
  console.error("\n\x1b[31m验证脚本异常：\x1b[0m", e);
  process.exit(1);
});
