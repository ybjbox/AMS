/**
 * P1-2 回归：外键约束（删除员工级联清考勤 / 删除部门置空员工引用）+ 表结构校验。
 *
 * 运行前置：dev server 已在 127.0.0.1:3000 启动（且已应用外键迁移）。
 * 该脚本会创建/删除名为 FK_TEMP_* 的临时员工与部门，并在结束时还原
 * 考勤排班、打卡记录与部门树，保证对开发库无副作用。
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const BASE = "http://127.0.0.1:3000";
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

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

// ---------- 鉴权 ----------
const pwMatch = readFileSync("data/ADMIN_CREDENTIALS.txt", "utf8").match(/密码:\s*(.+)/);
const adminPw = pwMatch ? pwMatch[1].trim() : "";
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: adminPw }),
});
const loginJson = await loginRes.json();
let TOKEN = loginJson.token;
ok("管理员登录成功（获取 Bearer token）", !!TOKEN, `status ${loginRes.status}`);

// 种子态 admin 需要改密才能调用业务接口；改密后换取可用 token
if (loginJson.user?.mustChangePassword) {
  const chRes = await fetch(`${BASE}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ currentPassword: adminPw, newPassword: "FkVerifyTemp123!" }),
  });
  const chJson = await chRes.json();
  if (chJson.token) TOKEN = chJson.token;
  ok("种子态改密以获得可用 token", !!TOKEN && chRes.status === 200, `status ${chRes.status}`);
}

// ---------- 1. 表结构：外键定义存在 ----------
console.log("\n=== 1. 表结构外键定义（PRAGMA foreign_key_list）===");
let db;
try {
  db = new DatabaseSync("data/ams.db", { readOnly: true });
} catch (e) {
  ok("以只读方式打开 data/ams.db", false, String(e));
}
if (db) {
  const fkMap = {};
  for (const t of ["employees", "schedules", "punch_records", "anomalies", "departments", "roles", "folders", "documents"]) {
    const rows = db.prepare(`PRAGMA foreign_key_list(${t})`).all();
    fkMap[t] = rows.map((r) => ({ from: r.from, table: r.table, onDelete: r.on_delete }));
  }
  const has = (t, from, table) => fkMap[t]?.some((f) => f.from === from && f.table === table);

  ok("employees.departmentId → departments", has("employees", "departmentId", "departments"));
  ok("schedules.employeeId → employees (CASCADE)", fkMap.schedules?.some((f) => f.from === "employeeId" && f.table === "employees" && f.onDelete === "CASCADE"));
  ok("punch_records.employeeId → employees (CASCADE)", fkMap.punch_records?.some((f) => f.from === "employeeId" && f.table === "employees" && f.onDelete === "CASCADE"));
  ok("anomalies.employeeId → employees (CASCADE)", fkMap.anomalies?.some((f) => f.from === "employeeId" && f.table === "employees" && f.onDelete === "CASCADE"));
  ok("departments.parentId → departments (CASCADE)", fkMap.departments?.some((f) => f.from === "parentId" && f.table === "departments" && f.onDelete === "CASCADE"));
  ok("roles.departmentId → departments (SET NULL)", fkMap.roles?.some((f) => f.from === "departmentId" && f.table === "departments" && f.onDelete === "SET NULL"));
  ok("folders.parentId → folders (CASCADE)", fkMap.folders?.some((f) => f.from === "parentId" && f.table === "folders" && f.onDelete === "CASCADE"));
  ok("documents.folderId → folders (CASCADE)", fkMap.documents?.some((f) => f.from === "folderId" && f.table === "folders" && f.onDelete === "CASCADE"));
}

// ---------- 2. 删除员工级联清除考勤数据 ----------
console.log("\n=== 2. 删除员工级联清除 schedules / punch_records / anomalies ===");
const origSchedulesRes = await req("GET", "/api/attendance/schedules");
const origRecordsRes = await req("GET", "/api/attendance/records");
const origSchedules = Array.isArray(origSchedulesRes.body) ? origSchedulesRes.body : [];
const origRecords = Array.isArray(origRecordsRes.body) ? origRecordsRes.body : [];

const emp = (await req("POST", "/api/users", { name: "FK_TEMP_EMP" })).body;
ok("创建临时员工", !!emp && !!emp.id, JSON.stringify(emp).slice(0, 80));
const empId = emp?.id;

await req("PUT", "/api/attendance/schedules", {
  schedules: [...(origSchedules || []), { employeeId: empId, employeeName: emp.name, shiftIds: ["1"] }],
});
await req("PUT", "/api/attendance/records", {
  records: [...(origRecords || []), { id: "fk_temp_rec", employeeId: empId, employeeName: emp.name, date: "2026-01-01", time: "09:00" }],
});

// 触发异常分析，会往 anomalies 写入该员工的记录
await req("POST", "/api/attendance/analyze");

const before = await req("GET", `/api/users/${empId}`);
ok("删除前员工存在", before.status === 200);

const del = await req("DELETE", `/api/users/${empId}`);
ok("删除临时员工返回成功", del.status === 200, `status ${del.status}`);

const afterSchedules = (await req("GET", "/api/attendance/schedules")).body || [];
const afterRecords = (await req("GET", "/api/attendance/records")).body || [];
const afterAnomalies = (await req("GET", "/api/attendance/anomalies")).body || [];

ok("级联删除：schedules 中无该员工残留", !afterSchedules.some((s) => s.employeeId === empId));
ok("级联删除：punch_records 中无该员工残留", !afterRecords.some((r) => r.employeeId === empId));
ok("级联删除：anomalies 中无该员工残留", !afterAnomalies.some((a) => a.employeeId === empId));

// 还原考勤数据
await req("PUT", "/api/attendance/schedules", { schedules: origSchedules || [] });
await req("PUT", "/api/attendance/records", { records: origRecords || [] });

// ---------- 3. 删除部门置空员工引用 ----------
console.log("\n=== 3. 删除部门后员工 departmentId 置空、部门名解析为空 ===");
const deptResp = (await req("GET", "/api/departments")).body;
const origDepts = deptResp?.departments || [];

const tempDept = { id: "fk_temp_dept", name: "FK_TEMP_DEPT", priority: 1, children: [] };
const putDept = await req("PUT", "/api/departments/tree", { departments: [...origDepts, tempDept] });
ok("临时部门已加入架构树", putDept.status === 200, `status ${putDept.status}`);

const emp2 = (await req("POST", "/api/users", { name: "FK_TEMP_EMP2", department: "FK_TEMP_DEPT" })).body;
const emp2Id = emp2?.id;
ok("创建指向临时部门的员工", !!emp2Id, JSON.stringify(emp2).slice(0, 80));
const linked = await req("GET", `/api/users/${emp2Id}`);
ok("写入后 departmentId 已关联临时部门", linked.body?.departmentId === "fk_temp_dept", `departmentId=${linked.body?.departmentId}`);

// 删除该部门（从树中去掉）
const rmDept = await req("PUT", "/api/departments/tree", { departments: origDepts });
ok("从架构树移除临时部门", rmDept.status === 200, `status ${rmDept.status}`);

const afterEmp2 = (await req("GET", `/api/users/${emp2Id}`)).body;
ok("部门删除后 departmentId 置空（SET NULL）", afterEmp2?.departmentId === null, `departmentId=${afterEmp2?.departmentId}`);
ok("部门删除后部门名解析为空（无陈旧字符串）", afterEmp2?.department === "", `department='${afterEmp2?.department}'`);

// 清理
await req("DELETE", `/api/users/${emp2Id}`);

// 还原 admin 为种子态（与 data/ADMIN_CREDENTIALS.txt 一致，保证脚本可重复运行）
const resetRes = await fetch(`${BASE}/api/auth/accounts/admin/reset-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ newPassword: adminPw }),
});
ok("还原 admin 初始密码（种子态）", resetRes.status === 200, `status ${resetRes.status}`);

// ---------- 汇总 ----------
console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
if (fail > 0) {
  console.log("失败项：");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("P1-2 外键约束验证全部通过 ✅");
process.exit(0);
