/**
 * P1-5 回归：操作审计落库。
 *
 * 覆盖点：
 *   1. audit_logs 表结构与索引存在
 *   2. 员工增/改/删被自动留痕，且带 before/after 字段级差异
 *   3. 敏感信息脱敏（密码不落库、身份证掩码）
 *   4. 失败请求记为 WARN 且带失败原因
 *   5. 安全事件（登录/越权）桥接进同一张表
 *   6. 高危动作（导出员工数据）留痕并记录条数
 *   7. 非管理员读不到审计日志；任何删除入口被拒（405，只增不删）
 *   8. 过滤 / 分页 / facets / CSV 导出可用
 *
 * 运行：node scripts/verify-audit.mjs（也包含在 npm run test:server 里）
 * 自起临时 DATA_DIR + 随机端口的私有实例：审计看的是**真库里的行**，
 * 因此直接只读打开那个临时 DATA_DIR/ams.db 做表结构校验；创建的临时数据随目录消失。
 */
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { bootServer, summarize } from "./lib/liveServer.mjs";

let pass = 0;
let fail = 0;
const failures = [];
let TOKEN = "";

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

async function req(method, path, body, token = TOKEN) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, text };
}

/** 拉取最近 N 条审计记录 */
async function recentLogs(params = "limit=100") {
  const r = await req("GET", `/api/audit-logs?${params}`);
  return Array.isArray(r.body?.items) ? r.body.items : [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 鉴权
const { base: BASE, token: bootToken, dataDir, stop } = await bootServer({ tag: "audit" });
TOKEN = bootToken;
ok("管理员登录成功（获取 Bearer token）", !!TOKEN);

// ---------------------------------------------------------------- 1. 表结构
console.log("\n=== 1. audit_logs 表结构 ===");
{
  let db;
  try {
    db = new DatabaseSync(path.join(dataDir, "ams.db"), { readOnly: true });
  } catch (e) {
    ok("以只读方式打开临时库", false, String(e));
  }
  if (db) {
    const cols = db.prepare("PRAGMA table_info(audit_logs)").all().map((c) => c.name);
    const need = ["at", "actor", "actorRole", "action", "category", "level", "targetType",
      "targetId", "targetName", "status", "result", "ip", "ua", "beforeJson", "afterJson",
      "changesJson", "detail", "durationMs"];
    const missing = need.filter((c) => !cols.includes(c));
    ok("audit_logs 表包含全部审计字段", missing.length === 0, `缺少 ${missing.join(",")}`);

    const idx = db.prepare("PRAGMA index_list(audit_logs)").all().map((i) => i.name);
    ok("按时间/操作人/动作建立了索引",
      idx.includes("idx_audit_at") && idx.includes("idx_audit_actor") && idx.includes("idx_audit_action"),
      idx.join(","));
    db.close();
  }
}

// ---------------------------------------------------------------- 2. 员工写操作留痕
console.log("\n=== 2. 员工增改删自动留痕（含 before/after 差异）===");
const created = await req("POST", "/api/users", {
  name: "AUDIT_TEMP_张三",
  phone: "13800001111",
  idCard: "440106199001011234",
  department: "研发部",
  role: "后端工程师",
  status: "在职",
});
const empId = created.body?.id;
ok("创建临时员工成功", created.status === 201 && !!empId, `status ${created.status}`);

await sleep(120);
let logs = await recentLogs("limit=50");
const createLog = logs.find((l) => l.action === "employee.create" && l.targetName === "AUDIT_TEMP_张三");
ok("新增员工被记录为 employee.create", !!createLog, `最近动作: ${logs.slice(0, 3).map((l) => l.action).join(",")}`);
ok("记录了操作人 admin 与角色", createLog?.actor === "admin" && !!createLog?.actorRole, `actor=${createLog?.actor}`);
ok("记录了来源 IP 与状态码", !!createLog?.ip && createLog?.status === 201, `ip=${createLog?.ip} status=${createLog?.status}`);
ok("结果标记为 success", createLog?.result === "success", `result=${createLog?.result}`);

// 修改：改部门 + 改手机号，检查字段级 diff
const updated = await req("PUT", `/api/users/${empId}`, { department: "市场部", phone: "13900002222" });
ok("修改临时员工成功", updated.status === 200, `status ${updated.status}`);

await sleep(120);
logs = await recentLogs("limit=50");
const updateLog = logs.find((l) => l.action === "employee.update" && l.targetId === empId);
ok("修改员工被记录为 employee.update", !!updateLog);
ok("记录了修改前快照（before）", !!updateLog?.before && typeof updateLog.before === "object");
ok("记录了修改后快照（after）", !!updateLog?.after && typeof updateLog.after === "object");
ok("差异字段包含 department", Array.isArray(updateLog?.changes) && updateLog.changes.includes("department"),
  `changes=${JSON.stringify(updateLog?.changes)}`);
ok("差异字段包含 phone", Array.isArray(updateLog?.changes) && updateLog.changes.includes("phone"),
  `changes=${JSON.stringify(updateLog?.changes)}`);
ok("before/after 能还原「改成了什么」",
  updateLog?.before?.department === "研发部" && updateLog?.after?.department === "市场部",
  `${updateLog?.before?.department} -> ${updateLog?.after?.department}`);

// ---------------------------------------------------------------- 3. 脱敏
console.log("\n=== 3. 敏感信息脱敏 ===");
ok("身份证在审计快照里被掩码", 
  typeof updateLog?.before?.idCard === "string" && updateLog.before.idCard.includes("*"),
  `idCard=${updateLog?.before?.idCard}`);
ok("身份证保留首6末4便于核对",
  /^440106\*+1234$/.test(String(updateLog?.before?.idCard ?? "")),
  `idCard=${updateLog?.before?.idCard}`);
ok("手机号被掩码", /^\d{3}\*{4}\d{4}$/.test(String(updateLog?.after?.phone ?? "")),
  `phone=${updateLog?.after?.phone}`);

// 改密动作不能把密码明文写进审计表
await req("POST", "/api/auth/change-password", {
  currentPassword: "WrongPassword_AUDIT_9x!",
  newPassword: "AnotherPassword_AUDIT_9x!",
});
await sleep(120);
{
  const all = JSON.stringify(await recentLogs("limit=200"));
  ok("审计表中不含明文密码", !all.includes("AnotherPassword_AUDIT_9x") && !all.includes("WrongPassword_AUDIT_9x"));
}

// ---------------------------------------------------------------- 4. 失败请求留痕
console.log("\n=== 4. 失败操作也留痕（WARN + 原因）===");
const badReq = await req("POST", "/api/users", { phone: "13000000000" }); // 缺 name
ok("缺字段的创建请求被拒（400）", badReq.status === 400, `status ${badReq.status}`);
await sleep(120);
{
  const l = (await recentLogs("limit=50")).find((x) => x.status === 400 && x.action === "employee.create");
  ok("失败请求被记录", !!l);
  ok("失败请求等级为 WARN", l?.level === "WARN", `level=${l?.level}`);
  ok("失败请求 result=failure", l?.result === "failure", `result=${l?.result}`);
  ok("记录了失败原因", !!l?.detail && l.detail.length > 0, `detail=${l?.detail}`);
}

// ---------------------------------------------------------------- 5. 安全事件桥接
console.log("\n=== 5. 安全事件并入同一时间线 ===");
{
  const loginLogs = await recentLogs("category=安全&limit=100");
  ok("登录成功事件出现在审计日志里", loginLogs.some((l) => l.action === "auth.login_success"));
  const kinds = new Set(loginLogs.map((l) => l.action));
  ok("改密失败事件被记录为 WARN",
    loginLogs.some((l) => l.action === "auth.change_password_failed" && l.level === "WARN"),
    `kinds=${[...kinds].join(",")}`);
}

// ---------------------------------------------------------------- 6. 高危动作：导出
console.log("\n=== 6. 导出员工数据留痕 ===");
{
  const exportRes = await fetch(`${BASE}/api/export/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      data: [
        { id: "X1", name: "甲", status: "在职" },
        { id: "X2", name: "乙", status: "在职" },
      ],
      config: { title: "审计回归导出", columns: [{ header: "姓名", key: "name" }], includeResigned: true },
    }),
  });
  ok("导出接口调用成功", exportRes.status === 200, `status ${exportRes.status}`);
  await exportRes.arrayBuffer();
  await sleep(150);
  const l = (await recentLogs("limit=50")).find((x) => x.action === "export.employees");
  ok("导出动作被记录", !!l);
  ok("导出记录了条数与标题", !!l?.detail && l.detail.includes("2 条"), `detail=${l?.detail}`);
  ok("导出记录了耗时", typeof l?.durationMs === "number" && l.durationMs >= 0, `durationMs=${l?.durationMs}`);
}

// ---------------------------------------------------------------- 7. 访问控制 + 只增不删
console.log("\n=== 7. 仅管理员可读，且不可删除 ===");
const EMP_USER = "audit_probe_emp";
{
  await req("DELETE", `/api/auth/accounts/${EMP_USER}`);
  const mk = await req("POST", "/api/auth/accounts", {
    username: EMP_USER, password: "AuditProbe123", systemRole: "EMPLOYEE",
  });
  ok("创建低权限探针账号", mk.status === 201, `status ${mk.status}`);

  const lg = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMP_USER, password: "AuditProbe123" }),
  });
  const lgJson = await lg.json();
  let empToken = lgJson.token;
  // 新账号带 mustChangePassword，先改密换取可用会话
  if (lgJson.user?.mustChangePassword) {
    const ch = await fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({ currentPassword: "AuditProbe123", newPassword: "AuditProbe456!" }),
    });
    const chJson = await ch.json();
    if (chJson.token) empToken = chJson.token;
  }

  const denied = await req("GET", "/api/audit-logs?limit=5", undefined, empToken);
  ok("普通员工读取审计日志被拒（403）", denied.status === 403, `status ${denied.status}`);
  ok("拒绝原因为权限不足", denied.body?.code === "FORBIDDEN", `code=${denied.body?.code}`);

  const anon = await req("GET", "/api/audit-logs?limit=5", undefined, "");
  ok("未登录读取审计日志被拒（401）", anon.status === 401, `status ${anon.status}`);

  const del = await req("DELETE", "/api/audit-logs");
  ok("管理员也不能删除审计日志（405）", del.status === 405, `status ${del.status}`);
  ok("拒绝码为 AUDIT_APPEND_ONLY", del.body?.code === "AUDIT_APPEND_ONLY", `code=${del.body?.code}`);

  const del2 = await req("DELETE", "/api/audit-logs/1");
  ok("单条删除同样被拒（405）", del2.status === 405, `status ${del2.status}`);

  await req("DELETE", `/api/auth/accounts/${EMP_USER}`);
}

// ---------------------------------------------------------------- 8. 查询能力
console.log("\n=== 8. 过滤 / 分页 / facets / CSV ===");
{
  const all = await req("GET", "/api/audit-logs?limit=5");
  ok("列表返回 total/items/levels", typeof all.body?.total === "number" && Array.isArray(all.body?.items) && !!all.body?.levels);
  ok("limit 生效", all.body.items.length <= 5, `len=${all.body.items.length}`);
  ok("返回保留期天数", typeof all.body?.retentionDays === "number", `retentionDays=${all.body?.retentionDays}`);

  const page2 = await req("GET", "/api/audit-logs?limit=5&offset=5");
  const idsA = all.body.items.map((i) => i.id).join(",");
  const idsB = (page2.body.items ?? []).map((i) => i.id).join(",");
  ok("offset 分页返回不同数据", idsA !== idsB, `p1=${idsA} p2=${idsB}`);

  const byAction = await req("GET", "/api/audit-logs?action=employee.update&limit=20");
  ok("按动作过滤只返回该动作",
    (byAction.body.items ?? []).length > 0 && byAction.body.items.every((i) => i.action === "employee.update"));

  const byLevel = await req("GET", "/api/audit-logs?level=WARN&limit=20");
  ok("按等级过滤只返回 WARN",
    (byLevel.body.items ?? []).every((i) => i.level === "WARN"), `count=${byLevel.body.items?.length}`);

  const byKeyword = await req("GET", `/api/audit-logs?q=AUDIT_TEMP&limit=20`);
  ok("关键词搜索命中临时员工记录", (byKeyword.body.items ?? []).length > 0, `count=${byKeyword.body.items?.length}`);

  const byActor = await req("GET", "/api/audit-logs?actor=admin&limit=10");
  ok("按操作人过滤生效", (byActor.body.items ?? []).every((i) => i.actor.includes("admin")));

  const facets = await req("GET", "/api/audit-logs/facets");
  ok("facets 返回动作/分类/操作人候选",
    Array.isArray(facets.body?.actions) && Array.isArray(facets.body?.categories) && Array.isArray(facets.body?.actors));
  ok("facets 分类里包含「员工」", (facets.body?.categories ?? []).includes("员工"),
    `categories=${(facets.body?.categories ?? []).join(",")}`);

  const csvRes = await fetch(`${BASE}/api/audit-logs/export?limit=50`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  // 注意：Response.text() 会按规范吃掉前导 BOM，所以要看原始字节才能验出来
  const raw = new Uint8Array(await csvRes.arrayBuffer());
  const csv = new TextDecoder("utf-8").decode(raw);
  ok("CSV 导出返回 200", csvRes.status === 200, `status ${csvRes.status}`);
  ok("CSV 带 UTF-8 BOM（Excel 不乱码）",
    raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf,
    `前三字节 ${raw[0]},${raw[1]},${raw[2]}`);
  ok("CSV 响应类型为 text/csv",
    (csvRes.headers.get("content-type") ?? "").includes("text/csv"),
    csvRes.headers.get("content-type") ?? "");
  ok("CSV 含表头与数据行", csv.includes("操作人") && csv.split("\r\n").length > 2, `lines=${csv.split("\r\n").length}`);
}

// ---------------------------------------------------------------- 9. 删除留痕 + 清理
console.log("\n=== 9. 删除动作留痕 ===");
{
  const del = await req("DELETE", `/api/users/${empId}`);
  ok("删除临时员工成功", del.status === 200, `status ${del.status}`);
  await sleep(150);
  const l = (await recentLogs("limit=50")).find((x) => x.action === "employee.delete" && x.targetId === empId);
  ok("删除动作被记录", !!l);
  ok("删除记录保留了被删对象的快照", !!l?.before && l.before.name === "AUDIT_TEMP_张三",
    `before.name=${l?.before?.name}`);
  ok("删除记录带对象名称便于检索", l?.targetName === "AUDIT_TEMP_张三", `targetName=${l?.targetName}`);
}

// 私有实例跑完即拆（临时目录一起删），不需要"把 admin 还原成种子态"
await stop();

// ---------------------------------------------------------------- 汇总
process.exit(summarize({ pass, fail, failures }));
