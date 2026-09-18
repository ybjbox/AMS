/**
 * 审批闭环回归测试（对应 2026-09 四个数据正确性修复中的 #1/#3）：
 *  1. 「调休」批准后从 overtime_ledger 实际扣减（此前只校验不扣，余额只增不减）；
 *  2. 待审调休申请计入 getPendingCompUsedHours（提交时预占额度）；
 *  3. 重复决定返回 conflict（并发双审防护）；
 *  4. 已批准请假日从考勤异常分析中剔除（此前半天请假只有一次打卡被误标缺卡）；
 *  5. v6 schema：删除部门对其职位级联删除（此前 NOT NULL + SET NULL 矛盾直接报错）。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test，与开发库完全隔离。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../db.ts";
import { runMigrations } from "../migrate.ts";
import { createAccount } from "../authDb.ts";
import {
  createApproval,
  decideApproval,
  getCompBalance,
  getPendingCompUsedHours,
  leaveDaysBetween,
} from "../approvalsDb.ts";
import {
  listShifts,
  upsertSchedule,
  upsertRecord,
  deleteRecord,
  deleteSchedule,
  analyzeAnomalies,
  listAnomalies,
} from "../attendanceDb.ts";

const TEST_USER = "approvals-it-test";

function getTestEmployee(): { id: string; name: string } {
  const row = db.prepare("SELECT id, name FROM employees LIMIT 1").get() as {
    id: string;
    name: string;
  };
  return { id: String(row.id), name: String(row.name) };
}

function balanceOf(employeeId: string): number {
  return getCompBalance(employeeId);
}

beforeAll(() => {
  runMigrations();
  db.exec("PRAGMA foreign_keys = ON");
  const emp = getTestEmployee();
  // data-test 库跨运行持久化：清掉本用例的历史审批与台账，保证断言可重复
  db.prepare("DELETE FROM approvals WHERE applicant = ?").run(TEST_USER);
  db.prepare("DELETE FROM overtime_ledger WHERE employeeId = ?").run(emp.id);
  const exists = db
    .prepare("SELECT username FROM accounts WHERE username = ?")
    .get(TEST_USER);
  if (exists) {
    db.prepare("UPDATE accounts SET employeeId = ? WHERE username = ?").run(emp.id, TEST_USER);
  } else {
    createAccount({
      username: TEST_USER,
      password: "Test-Only#2026pass",
      systemRole: "EMPLOYEE",
      employeeId: emp.id,
    });
  }
});

describe("leaveDaysBetween：请假天数口径（含首尾）", () => {
  it("单日 / 跨三天 / 无结束日期 / 倒挂区间", () => {
    expect(leaveDaysBetween("2026-09-10", "2026-09-10")).toBe(1);
    expect(leaveDaysBetween("2026-09-10", "2026-09-12")).toBe(3);
    expect(leaveDaysBetween("2026-09-10", null)).toBe(1);
    expect(leaveDaysBetween("2026-09-10", "2026-09-01")).toBe(1);
  });
});

describe("调休额度闭环（加班入账 → 调休扣减）", () => {
  it("加班批准 +8h，调休批准 −8h；重复决定 conflict；余额不会被扣成负数", () => {
    const emp = getTestEmployee();
    const start = balanceOf(emp.id);

    // ① 加班 8h 获批 → 入账
    const ot = createApproval({
      applicant: TEST_USER,
      type: "overtime",
      leaveType: "加班",
      startDate: "2026-09-01",
      reason: "回归用例：加班入账",
      hours: 8,
    });
    const otApproved = decideApproval(ot.id, "approved", "admin", "", "SUPER_ADMIN");
    expect(otApproved.row?.status).toBe("approved");
    expect(balanceOf(emp.id)).toBe(start + 8);

    // ② 待审调休 1 天 → 占用 8h
    const comp = createApproval({
      applicant: TEST_USER,
      type: "leave",
      leaveType: "调休",
      startDate: "2026-09-10",
      reason: "回归用例：调休扣减",
    });
    expect(getPendingCompUsedHours(TEST_USER)).toBe(8);

    // ③ 批准调休 → 实际扣减，余额回到起点
    const compApproved = decideApproval(comp.id, "approved", "admin", "", "SUPER_ADMIN");
    expect(compApproved.row?.status).toBe("approved");
    expect(balanceOf(emp.id)).toBe(start);

    // ④ 重复决定 → conflict（不改变余额）
    expect(decideApproval(comp.id, "rejected", "admin", "", "SUPER_ADMIN").conflict).toBe(true);
    expect(balanceOf(emp.id)).toBe(start);

    // ⑤ 余额不足时再批一笔调休 → 扣减失败但不产生负余额（并发占用的兜底路径）
    const comp2 = createApproval({
      applicant: TEST_USER,
      type: "leave",
      leaveType: "调休",
      startDate: "2026-09-11",
      reason: "回归用例：超额兜底",
    });
    if (start < 8) {
      decideApproval(comp2.id, "approved", "admin", "", "SUPER_ADMIN");
      expect(balanceOf(emp.id)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("已批准请假日不计考勤异常", () => {
  const leaveDate = "2026-08-05";

  it("单次打卡标记缺卡；请假日获批后异常消失", () => {
    const emp = getTestEmployee();
    const shift = listShifts()[0];
    expect(shift, "种子数据应含默认班次").toBeTruthy();

    upsertSchedule({ employeeId: emp.id, employeeName: emp.name, shiftIds: [shift.id] });
    // 清掉历史失败运行残留的打卡，保证「当日仅一次打卡」前置成立
    db.prepare("DELETE FROM punch_records WHERE employeeId = ? AND date = ?").run(
      emp.id,
      leaveDate
    );
    const punch = upsertRecord({
      employeeId: emp.id,
      employeeName: emp.name,
      date: leaveDate,
      time: "09:30",
    });

    analyzeAnomalies();
    const flagged = listAnomalies().filter(
      (a) => a.employeeId === emp.id && a.date === leaveDate
    );
    expect(flagged.length).toBe(1); // 仅一次打卡 → 缺卡

    const leave = createApproval({
      applicant: TEST_USER,
      type: "leave",
      leaveType: "事假",
      startDate: leaveDate,
      reason: "回归用例：半天请假",
    });
    expect(decideApproval(leave.id, "approved", "admin", "", "SUPER_ADMIN").row?.status).toBe(
      "approved"
    );

    analyzeAnomalies();
    const after = listAnomalies().filter((a) => a.employeeId === emp.id && a.date === leaveDate);
    expect(after.length).toBe(0); // 请假日剔除

    // 清理：不影响其他用例对同一员工/日期的观察
    deleteRecord(punch.id);
    deleteSchedule(emp.id);
    analyzeAnomalies();
  });
});

describe("v6 外键：删除部门级联删除其职位", () => {
  it("departmentId NOT NULL + CASCADE，删部门不再触发约束错误", () => {
    db.exec(
      `DELETE FROM departments WHERE id = 'dept-fk-test';
       DELETE FROM roles WHERE id = 'role-fk-test';`
    );
    db.prepare("INSERT INTO departments (id, name, priority) VALUES (?, ?, 0)").run(
      "dept-fk-test",
      "外键测试部门"
    );
    db.prepare("INSERT INTO roles (id, name, departmentId) VALUES (?, ?, ?)").run(
      "role-fk-test",
      "测试职位",
      "dept-fk-test"
    );

    db.prepare("DELETE FROM departments WHERE id = ?").run("dept-fk-test");
    const orphan = db.prepare("SELECT id FROM roles WHERE id = ?").get("role-fk-test");
    expect(orphan).toBeUndefined(); // CASCADE 生效（v5 定义下此句会抛约束错误）
  });
});
