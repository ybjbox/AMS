/**
 * 看板窗口聚合（attendanceWindowStats）的口径回归。
 *
 * 这块原来是 statsRouter 里自己抄的一份「排班 + 当天首末卡」简化算法，
 * 与异常分析/月报各说一套；排班界面撤掉后更是直接算成空。现在改成共用
 * buildShiftPlanner + resolveInstances，所以这里钉的每一条都是「看板与考勤必须一致」。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test；只动本文件自建的部门/员工/时段/打卡/审批。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, createEmployee, deleteEmployee } from '../db.ts';
import { ensureOrgTables } from '../departmentsDb.ts';
import { ensurePunchRecordUniqueIndex } from '../migrate.ts';
import { createAccount, deleteAccount } from '../authDb.ts';
import { attendanceWindowStats, insertSourcedRecords } from '../attendanceDb.ts';
import { createDeptShiftRule, deleteDeptShiftRule, listDeptShiftRules } from '../shiftRulesDb.ts';

const PW = 'Window#Test2026-aa';
const DEPT = 'qa-window-dept';
const NO_RULE_DEPT = 'qa-window-no-rule';
/** 窗口用固定日期：远离今天，避免测试随跑测日期漂移 */
const MON = '2026-09-21';
const TUE = '2026-09-22';
const WED = '2026-09-23';
const D1 = [MON, TUE, WED];

let emp: { id: string; name: string };
let empNight: { id: string; name: string };
let empNoRule: { id: string; name: string };

function punch(employee: { id: string; name: string }, date: string, ...times: string[]) {
  insertSourcedRecords(
    times.map((time) => ({ employeeId: employee.id, employeeName: employee.name, date, time, source: 'test' }))
  );
}

function addRule(name: string, startTime: string, endTime: string, workdays = [1, 2, 3, 4, 5, 6, 7]) {
  // earlyLeaveAsMissingOutMinutes 不在这里传：新增时段只暴露这两个可选项，
  // 翻转为「缺下班卡」的阈值走 shiftMatch 的缺省值（60 分钟）。
  return createDeptShiftRule({
    departmentId: DEPT,
    name,
    startTime,
    endTime,
    workdays,
    assumeMissingIn: false,
    overtimeGraceMinutes: 120,
  });
}

function clearRules() {
  for (const r of listDeptShiftRules().filter((r) => r.departmentId === DEPT)) deleteDeptShiftRule(r.id);
}

function clearPunches() {
  db.prepare('DELETE FROM punch_records WHERE employeeId IN (?, ?, ?)').run(emp.id, empNight.id, empNoRule.id);
}

beforeAll(() => {
  ensureOrgTables();
  ensurePunchRecordUniqueIndex();
  db.prepare('INSERT OR REPLACE INTO departments (id, name, priority, parentId) VALUES (?, ?, ?, NULL)').run(
    DEPT,
    'QA窗口统计部',
    903
  );
  db.prepare('INSERT OR REPLACE INTO departments (id, name, priority, parentId) VALUES (?, ?, ?, NULL)').run(
    NO_RULE_DEPT,
    'QA窗口无时段部',
    904
  );
  emp = createEmployee({ name: '窗口统计·日班员工', departmentId: DEPT })!;
  empNight = createEmployee({ name: '窗口统计·夜班员工', departmentId: DEPT })!;
  empNoRule = createEmployee({ name: '窗口统计·无时段员工', departmentId: NO_RULE_DEPT })!;
});

afterAll(() => {
  clearRules();
  clearPunches();
  db.prepare("DELETE FROM approvals WHERE applicant LIKE 'qa-window-%'").run();
  for (const u of ['qa-window-staff']) deleteAccount(u);
  for (const e of [emp, empNight, empNoRule]) deleteEmployee(e.id);
  db.prepare('DELETE FROM departments WHERE id IN (?, ?)').run(DEPT, NO_RULE_DEPT);
});

describe('窗口聚合与考勤同一口径', () => {
  it('迟到/早退/缺卡按班次实例判定，热力图分母是判定班次数', () => {
    clearRules();
    clearPunches();
    addRule('日班', '09:00', '18:00');
    punch(emp, MON, '09:20:00', '17:00:00'); // 迟到 20 分 + 早退 60 分（60 不超过翻转为缺卡的下限 → 记早退）
    punch(empNight, MON, '09:00:00', '18:10:00'); // 正常
    punch(empNight, WED, '09:00:00', '18:10:00'); // 正常；也让"截止日"落在窗口内而不是被截断

    const stats = attendanceWindowStats(D1);
    const mon = stats.days.find((d) => d.date === MON)!;
    expect(mon.judged).toBe(2);
    expect(mon.present).toBe(2);
    expect(mon.late).toBe(1);
    expect(mon.early).toBe(1);
    expect(mon.missing).toBe(0);
    expect(mon.punchDays).toBe(2);

    // 没打卡的日子：有"应出勤"但既没判定也没异常
    const tue = stats.days.find((d) => d.date === TUE)!;
    expect(tue.judged).toBe(0);
    expect(tue.punchDays).toBe(0);
    expect(tue.late + tue.early + tue.missing).toBe(0);

    const dept = stats.departmentRates.find((r) => r.name === 'QA窗口统计部')!;
    // 分母 = 2 名员工 × 3 天（都配了时段、都不在请假日）；周二没人打卡但仍算应出勤
    expect(dept.expected).toBe(6);
    expect(dept.attended).toBe(3); // 周一 2 人 + 周三 1 人
    expect(dept.rate).toBe(50);
    clearRules();
    clearPunches();
  });

  it('凌晨的下班卡归前一天的夜班，当天不再重复计一次出勤', () => {
    clearRules();
    clearPunches();
    addRule('小夜', '17:30', '01:00'); // 跨零点：01:00 的卡属于前一天
    punch(empNight, MON, '17:40:00');
    punch(empNight, TUE, '00:50:00'); // 这是周一夜班的下班卡

    const stats = attendanceWindowStats(D1);
    const mon = stats.days.find((d) => d.date === MON)!;
    const tue = stats.days.find((d) => d.date === TUE)!;
    expect(mon.judged).toBe(1);
    expect(tue.judged).toBe(0);
    expect(tue.punchDays).toBe(1); // 有卡，但卡属于前一天那班
    const dept = stats.departmentRates.find((r) => r.name === 'QA窗口统计部')!;
    expect(dept.attended).toBe(1);
    clearRules();
    clearPunches();
  });

  it('单张卡记缺卡，不算"没异常"', () => {
    clearRules();
    clearPunches();
    addRule('日班', '09:00', '18:00');
    punch(emp, MON, '09:05:00'); // 只有上班卡
    const mon = attendanceWindowStats(D1).days.find((d) => d.date === MON)!;
    expect(mon.judged).toBe(1);
    expect(mon.missing).toBe(1);
    expect(mon.late).toBe(0);
    clearRules();
    clearPunches();
  });

  it('没配时段的部门不参与判定，但要报出来（而不是静默当成没异常）', () => {
    clearRules();
    clearPunches();
    // 该计数是全公司口径（"谁还没配时段"的待办），故只断言"确实被报出来了"
    punch(empNoRule, MON, '09:00:00', '18:00:00');
    const stats = attendanceWindowStats(D1);
    expect(stats.noPlanEmployees).toBeGreaterThanOrEqual(1);
    expect(stats.departmentRates.some((r) => r.name === 'QA窗口无时段部')).toBe(false);
    const mon = stats.days.find((d) => d.date === MON)!;
    expect(mon.judged).toBe(0);
    expect(mon.punchDays).toBe(1); // 有卡，但没判定依据
    clearPunches();
  });

  it('已批准请假日不判、也不计入应出勤', () => {
    clearRules();
    clearPunches();
    addRule('日班', '09:00', '18:00');
    createAccount({
      username: 'qa-window-staff',
      password: PW,
      systemRole: 'EMPLOYEE',
      employeeId: emp.id,
    });
    db.prepare(
      `INSERT INTO approvals (id, applicant, type, leaveType, startDate, endDate, reason, status, approver, createdAt, decidedAt, requiredRole)
       VALUES (?, ?, 'leave', '事假', ?, ?, '窗口统计测试', 'approved', 'qa-hr', ?, ?, 'HR')`
    ).run('qa-window-ap-1', 'qa-window-staff', WED, WED, '2026-09-22 09:00:00', '2026-09-23 09:00:00');
    punch(emp, MON, '09:00:00', '18:00:00'); // 正常出勤
    punch(emp, WED, '09:00:00', '18:00:00'); // 请假当天竟然打了卡 → 不该计

    const stats = attendanceWindowStats(D1);
    const wed = stats.days.find((d) => d.date === WED)!;
    expect(wed.judged).toBe(0);
    const dept = stats.departmentRates.find((r) => r.name === 'QA窗口统计部')!;
    expect(dept.expected).toBe(5); // 2 名员工 × 3 天 − 周三 1 人请假
    expect(dept.attended).toBe(1);

    db.prepare('DELETE FROM approvals WHERE id = ?').run('qa-window-ap-1');
    clearRules();
    clearPunches();
  });

  it('打卡截止日之后的窗口日不算缺勤（还没数据 ≠ 缺勤）', () => {
    clearRules();
    clearPunches();
    addRule('日班', '09:00', '18:00');
    punch(emp, MON, '09:00:00', '18:00:00');
    const stats = attendanceWindowStats(D1);
    expect(stats.lastPunchDate).toBe(MON);
    expect(stats.ratedTo).toBe(MON);
    expect(stats.ratedFrom).toBe(MON);
    expect(stats.noDataDays).toBe(2); // 周二、周三没有任何打卡
    const dept = stats.departmentRates.find((r) => r.name === 'QA窗口统计部')!;
    expect(dept.expected).toBe(2); // 2 人 × 仅周一这 1 天，而不是 ×3 天
    expect(dept.attended).toBe(1);
    expect(dept.rate).toBe(50);
    clearRules();
    clearPunches();
  });

  it('窗口里一条卡都没有时：给空名单而不是全 0% 的假出勤率', () => {
    clearRules();
    clearPunches();
    const stats = attendanceWindowStats(D1);
    expect(stats.departmentRates).toEqual([]);
    expect(stats.lastPunchDate).toBeNull();
    expect(stats.days).toHaveLength(3);
    expect(stats.days.every((d) => d.judged === 0 && d.punchDays === 0)).toBe(true);
  });

  it('只统计工作日：时段配成周一至周五时，周末不进应出勤', () => {
    clearRules();
    clearPunches();
    addRule('五天班', '09:00', '18:00', [1, 2, 3, 4, 5]);
    // 2026-09-26 是周六
    punch(emp, '2026-09-26', '09:00:00', '18:00:00');
    const stats = attendanceWindowStats(['2026-09-25', '2026-09-26', '2026-09-27']);
    const sat = stats.days.find((d) => d.date === '2026-09-26')!;
    expect(sat.judged).toBe(0); // 周末不适用该时段
    expect(sat.punchDays).toBe(1);
    const dept = stats.departmentRates.find((r) => r.name === 'QA窗口统计部')!;
    expect(dept.expected).toBe(2); // 2 名员工 ×（周五、周一），周六不计
    expect(dept.attended).toBe(0);
    clearRules();
    clearPunches();
  });
});
