/**
 * P1-2 回归：外键约束（删除员工级联清考勤 / 删除部门置空员工引用）+ 表结构校验。
 *
 * 运行：node scripts/verify-fk.mjs（也包含在 npm run test:server 里）
 * 自起临时 DATA_DIR + 随机端口的私有实例：外键看的是**真库文件**，所以直接打开
 * 那个临时 DATA_DIR/ams.db 做 PRAGMA 校验；创建/删除的临时员工与部门随目录一起消失，
 * 不再需要"还原考勤/还原 admin 口令"这类收尾（这些收尾曾经把开发库改坏过）。
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { bootServer, summarize } from "./lib/liveServer.mjs";

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

async function main() {
  const { req, dataDir, stop } = await bootServer({ tag: "fk" });
  let db;
  try {
    // 外键定义只能从真实库文件里读；此时服务还活着（WAL 已建立），只读打开做 PRAGMA 校验
    db = new DatabaseSync(path.join(dataDir, "ams.db"), { readOnly: true });

    // ---------- 1. 表结构：外键定义存在 ----------
    console.log("\n=== 1. 表结构外键定义（PRAGMA foreign_key_list）===");
    const fkMap = {};
    for (const t of ["employees", "schedules", "punch_records", "anomalies", "departments", "roles", "folders", "documents", "dept_shift_rules"]) {
      fkMap[t] = db.prepare(`PRAGMA foreign_key_list(${t})`).all().map((r) => ({ from: r.from, table: r.table, onDelete: r.on_delete }));
    }
    const has = (t, from, table) => fkMap[t]?.some((f) => f.from === from && f.table === table);
    const cascade = (t, from, table) => fkMap[t]?.some((f) => f.from === from && f.table === table && f.onDelete === "CASCADE");

    ok("employees.departmentId → departments", has("employees", "departmentId", "departments"));
    ok("schedules.employeeId → employees (CASCADE)", cascade("schedules", "employeeId", "employees"));
    ok("punch_records.employeeId → employees (CASCADE)", cascade("punch_records", "employeeId", "employees"));
    ok("anomalies.employeeId → employees (CASCADE)", cascade("anomalies", "employeeId", "employees"));
    ok("departments.parentId → departments (CASCADE)", cascade("departments", "parentId", "departments"));
    // 职位依附部门：删部门要连职位一起走（SET NULL 只会留下谁也选不到的死选项）。
    // 原断言写的是 SET NULL，与 migrate.ts 的 ROLES_SCHEMA（CASCADE）不符 —— 这个脚本
    // 从来不进 CI，所以这条错断言一直没人踩到。
    ok("roles.departmentId → departments (CASCADE)", cascade("roles", "departmentId", "departments"));
    ok("folders.parentId → folders (CASCADE)", cascade("folders", "parentId", "folders"));
    ok("documents.folderId → folders (CASCADE)", cascade("documents", "folderId", "folders"));
    // 部门工作时段：没有外键时删部门会留下谁也匹配不到的死规则（v14 补的）
    ok("dept_shift_rules.departmentId → departments (CASCADE)", cascade("dept_shift_rules", "departmentId", "departments"));
    // 用户名是归属键，删账号后不能复用 → 墓碑表必须在（v14 补的）
    ok(
      "account_tombstones 表存在",
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_tombstones'").get() !== undefined
    );
  } catch (e) {
    ok("以只读方式打开临时库并读取外键", false, String(e));
  } finally {
    db?.close();
  }

  try {
    // ---------- 2. 删除员工级联清除考勤数据 ----------
    console.log("\n=== 2. 删除员工级联清除 schedules / punch_records / anomalies ===");
    const emp = (await req("POST", "/api/users", { name: "FK_TEMP_EMP" })).body;
    ok("创建临时员工", !!emp && !!emp.id, JSON.stringify(emp).slice(0, 80));
    const empId = emp?.id;

    await req("PUT", "/api/attendance/schedules", {
      schedules: [{ employeeId: empId, employeeName: emp.name, shiftIds: ["1"] }],
    });
    await req("PUT", "/api/attendance/records", {
      records: [{ id: "fk_temp_rec", employeeId: empId, employeeName: emp.name, date: "2026-01-01", time: "09:00" }],
    });
    // 触发异常分析，会往 anomalies 写入该员工的记录
    await req("POST", "/api/attendance/analyze");

    ok("删除前员工存在", (await req("GET", `/api/users/${empId}`)).status === 200);
    const del = await req("DELETE", `/api/users/${empId}`);
    ok("删除临时员工返回成功", del.status === 200, `status ${del.status}`);

    const afterSchedules = (await req("GET", "/api/attendance/schedules")).body || [];
    const afterRecords = (await req("GET", "/api/attendance/records")).body || [];
    const afterAnomalies = (await req("GET", "/api/attendance/anomalies")).body || [];
    ok("级联删除：schedules 中无该员工残留", !afterSchedules.some((s) => s.employeeId === empId));
    ok("级联删除：punch_records 中无该员工残留", !afterRecords.some((r) => r.employeeId === empId));
    ok("级联删除：anomalies 中无该员工残留", !afterAnomalies.some((a) => a.employeeId === empId));

    // ---------- 3. 删除部门置空员工引用 ----------
    console.log("\n=== 3. 删除部门后员工 departmentId 置空、部门名解析为空 ===");
    const origDepts = (await req("GET", "/api/departments")).body?.departments || [];

    const tempDept = { id: "fk_temp_dept", name: "FK_TEMP_DEPT", priority: 1, children: [] };
    const putDept = await req("PUT", "/api/departments/tree", { departments: [...origDepts, tempDept] });
    ok("临时部门已加入架构树", putDept.status === 200, `status ${putDept.status}`);

    const emp2Id = (await req("POST", "/api/users", { name: "FK_TEMP_EMP2", department: "FK_TEMP_DEPT" })).body?.id;
    ok("创建指向临时部门的员工", !!emp2Id, String(emp2Id));
    const linked = await req("GET", `/api/users/${emp2Id}`);
    ok("写入后 departmentId 已关联临时部门", linked.body?.departmentId === "fk_temp_dept", `departmentId=${linked.body?.departmentId}`);

    // 同部门下挂一个职位，用来验 roles 的 CASCADE（与 employees 的 SET NULL 是两种口径）
    const origRoles = (await req("GET", "/api/departments")).body?.roles || [];
    const tempRole = { id: "fk_temp_role", name: "FK_TEMP_ROLE", departmentId: "fk_temp_dept", priority: 1 };
    const putRoles = await req("PUT", "/api/departments/roles", { roles: [...origRoles, tempRole] });
    ok("临时职位已挂到临时部门", putRoles.status === 200, `status ${putRoles.status}`);

    const rmDept = await req("PUT", "/api/departments/tree", { departments: origDepts });
    ok("从架构树移除临时部门", rmDept.status === 200, `status ${rmDept.status}`);

    const afterEmp2 = (await req("GET", `/api/users/${emp2Id}`)).body;
    ok("部门删除后员工 departmentId 置空（SET NULL）", afterEmp2?.departmentId === null, `departmentId=${afterEmp2?.departmentId}`);
    ok("部门删除后部门名解析为空（无陈旧字符串）", afterEmp2?.department === "", `department='${afterEmp2?.department}'`);
    const rolesAfter = (await req("GET", "/api/departments")).body?.roles || [];
    ok("部门删除后其职位一并级联消失（CASCADE）", !rolesAfter.some((r) => r.id === "fk_temp_role"), `剩余 ${rolesAfter.length} 个职位`);
  } finally {
    await stop();
  }

  console.log(fail === 0 ? "P1-2 外键约束验证全部通过 ✅" : "");
  process.exit(summarize({ pass, fail, failures }));
}

main().catch((e) => {
  console.error("verify crashed:", e);
  process.exit(1);
});
