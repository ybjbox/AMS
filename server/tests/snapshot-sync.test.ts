/**
 * 展示用快照（姓名 / 部门名 / 系统角色）一致性回归（第 6 批）：
 *  1. 员工改名 → 各子表 employeeName 快照跟着走，按新名还能搜到打卡记录；
 *  2. syncDisplaySnapshots 能把存量漂移拉平（含 employees.department 副本）；
 *  3. User.systemRole 取绑定账号的真实角色，未绑定为空；
 *  4. 员工表那列 systemRole 是死列：写入载荷带它也不会改变真实角色。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用例自建数据并清理。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, createEmployee, updateEmployee, deleteEmployee, getEmployee } from "../db.ts";
import { createAccount, deleteAccount, updateAccountMeta } from "../authDb.ts";
import { upsertRecord, upsertSchedule, listRecords } from "../attendanceDb.ts";
import { createBusinessForm } from "../businessFormsDb.ts";
import { runMigrations, syncDisplaySnapshots } from "../migrate.ts";
import { asString } from "../sqliteUtil.ts";

const PW = "Snap#Test2026-aa";
const emp = { id: "", name: "" };

function childName(table: string, employeeId: string): string {
  const row = db.prepare(`SELECT employeeName FROM ${table} WHERE employeeId = ? LIMIT 1`).get(employeeId);
  return asString((row as { employeeName?: string } | undefined)?.employeeName);
}

beforeAll(() => {
  runMigrations();
  Object.assign(emp, createEmployee({ name: "快照测试甲", department: "快照测试部" })!);
});

afterAll(() => {
  for (const t of ["punch_records", "schedules", "anomalies", "business_forms", "contract_renewals", "overtime_ledger"]) {
    try {
      db.prepare(`DELETE FROM ${t} WHERE employeeId = ?`).run(emp.id);
    } catch {
      /* 表不存在时忽略 */
    }
  }
  db.prepare("DELETE FROM departments WHERE name = ?").run("快照测试部");
  deleteAccount("snap-staff");
  deleteEmployee(emp.id);
});

describe("姓名快照", () => {
  it("改名后子表快照同步，按新名仍能搜到打卡记录", () => {
    upsertRecord({ employeeId: emp.id, employeeName: emp.name, date: "2026-09-10", time: "09:00:00" });
    upsertSchedule({ employeeId: emp.id, employeeName: emp.name, shiftIds: [] });
    createBusinessForm(
      { employeeId: emp.id, employeeName: emp.name, kind: "wedding", kindLabel: "员工结婚贺喜红包", date: "2026-09-10", body: "快照测试单据" },
      "snap-admin"
    );
    expect(childName("punch_records", emp.id)).toBe("快照测试甲");

    updateEmployee(emp.id, { name: "快照测试甲改" });

    expect(childName("punch_records", emp.id)).toBe("快照测试甲改");
    expect(childName("schedules", emp.id)).toBe("快照测试甲改");
    expect(childName("business_forms", emp.id)).toBe("快照测试甲改");

    const byNewName = listRecords({ employeeName: "快照测试甲改" }) as unknown[];
    expect(Array.isArray(byNewName) ? byNewName.length : 0).toBe(1);
  });

  it("syncDisplaySnapshots 拉平手工制造的漂移，且幂等", () => {
    db.prepare("UPDATE punch_records SET employeeName = '旧名字' WHERE employeeId = ?").run(emp.id);
    db.prepare("UPDATE employees SET department = '旧部门名' WHERE id = ?").run(emp.id);

    syncDisplaySnapshots();
    expect(childName("punch_records", emp.id)).toBe("快照测试甲改");
    // departmentId 未关联（部门名反查失败）时保留档案自己的写法，不会被抹成空
    expect(getEmployee(emp.id)?.department).toBeDefined();

    syncDisplaySnapshots();
    expect(childName("punch_records", emp.id)).toBe("快照测试甲改");
  });
});

describe("系统角色真值", () => {
  it("User.systemRole 来自绑定账号；解绑后为空", () => {
    createAccount({ username: "snap-staff", password: PW, systemRole: "HR", employeeId: emp.id });
    expect(getEmployee(emp.id)?.systemRole).toBe("HR");

    // 载荷里带 systemRole 也改不动真实角色（员工表那列已不参与鉴权，也不再被写入）
    updateEmployee(emp.id, { systemRole: "EMPLOYEE", remarks: "死列写入测试" } as Record<string, unknown>);
    expect(getEmployee(emp.id)?.systemRole).toBe("HR");
    expect(getEmployee(emp.id)?.remarks).toBe("死列写入测试");

    updateAccountMeta("snap-staff", { employeeId: null });
    expect(getEmployee(emp.id)?.systemRole).toBe("");
  });
});
