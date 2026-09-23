/**
 * 部门工作时段与自动对班的落库回归（N1 判定层）。
 *
 * 覆盖三件最容易出错的事：
 *  1. 继承 —— 员工所在部门没配时段时要沿组织树向上取第一个配了时段的部门，且能报出来源；
 *  2. 优先级 —— 部门时段一旦生效就压过逐日排班（否则 HR 改了时段却看不到效果）；
 *  3. 覆盖率 —— 对不上班/无判定依据的人日必须出现在 coverage 里，不能伪装成"没有异常"。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test；只动本文件自己建的部门/员工/班次/打卡。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { db, createEmployee, deleteEmployee } from '../db.ts';
import { ensureOrgTables } from '../departmentsDb.ts';
import { ensurePunchRecordUniqueIndex } from '../migrate.ts';
import { authGate } from '../authMiddleware.ts';
import { createAccount, createSession, deleteAccount } from '../authDb.ts';
import { attendanceRouter } from '../attendanceRouter.ts';
import {
  analyzeAttendance,
  createShift,
  deleteSchedule,
  deleteShift,
  insertSourcedRecords,
  monthlySummary,
  upsertSchedule,
} from '../attendanceDb.ts';
import {
  createDeptShiftRule,
  deleteDeptShiftRule,
  listDeptShiftRules,
  resolveRulesForDepartment,
  ShiftRuleError,
  updateDeptShiftRule,
} from '../shiftRulesDb.ts';
import type { DbRow } from '../sqliteUtil.ts';

const PW = 'Shift#Test2026-aa';
const PARENT = 'qa-shift-parent';
const CHILD = 'qa-shift-child';
/** 既不建部门也不配规则，用来验证"完全没有依据"的分支 */
const MON = '2026-09-21'; // 周一
const SAT = '2026-09-26'; // 周六

let empChild: { id: string; name: string };
let empParent: { id: string; name: string };
let empNoDept: { id: string; name: string };

beforeAll(() => {
  ensureOrgTables();
  ensurePunchRecordUniqueIndex();
  db.prepare("INSERT OR REPLACE INTO departments (id, name, priority, parentId) VALUES (?, ?, ?, NULL)").run(PARENT, 'QA对班总部', 901);
  db.prepare("INSERT OR REPLACE INTO departments (id, name, priority, parentId) VALUES (?, ?, ?, ?)").run(CHILD, 'QA对班分部', 902, PARENT);
  empChild = createEmployee({ name: '对班测试·分部员工', departmentId: CHILD })!;
  empParent = createEmployee({ name: '对班测试·总部员工', departmentId: PARENT })!;
  empNoDept = createEmployee({ name: '对班测试·无部门员工' })!;
});

afterAll(() => {
  clearRules();
  clearPunches();
  for (const e of [empChild, empParent, empNoDept]) deleteSchedule(e.id);
  db.prepare("DELETE FROM shifts WHERE name = ?").run('QA对班晚班');
  for (const e of [empChild, empParent, empNoDept]) deleteEmployee(e.id);
  db.prepare('DELETE FROM departments WHERE id IN (?, ?)').run(PARENT, CHILD);
});

function addRule(departmentId: string, name: string, startTime: string, endTime: string, workdays = [1, 2, 3, 4, 5]) {
  const rule = createDeptShiftRule({ departmentId, name, startTime, endTime, workdays });

  return rule;
}

function clearRules() {
  for (const rule of listDeptShiftRules()) {
    if (rule.departmentId === PARENT || rule.departmentId === CHILD) deleteDeptShiftRule(rule.id);
  }

}

function clearPunches() {
  db.prepare('DELETE FROM punch_records WHERE employeeId IN (?, ?, ?)').run(empChild.id, empParent.id, empNoDept.id);
}

function punch(employee: { id: string; name: string }, date: string, ...times: string[]) {
  insertSourcedRecords(
    times.map((time) => ({ employeeId: employee.id, employeeName: employee.name, date, time, source: 'test' }))
  );
}

function anomaliesOf(employeeId: string, date?: string): DbRow[] {
  return (
    date
      ? db.prepare('SELECT * FROM anomalies WHERE employeeId = ? AND date = ?').all(employeeId, date)
      : db.prepare('SELECT * FROM anomalies WHERE employeeId = ?').all(employeeId)
  ) as unknown as DbRow[];
}

describe('时段配置与校验', () => {
  it('拒绝下班早于上班（不支持跨夜班）、坏时间格式、空工作日、不存在的部门', () => {
    expect(() => addRule(PARENT, '夜班', '20:00', '06:00')).toThrow(ShiftRuleError);
    expect(() => addRule(PARENT, '坏格式', '9:00', '18:00')).toThrow(/HH:mm/u);
    expect(() => addRule(PARENT, '没有工作日', '09:00', '18:00', [])).toThrow(/工作日/u);
    expect(() => addRule('qa-shift-missing', '乱挂', '09:00', '18:00')).toThrow(/部门不存在/u);
    expect(listDeptShiftRules().filter((r) => r.departmentId.startsWith('qa-shift-'))).toEqual([]);
  });

  it('编辑能改时间与工作日；删除后不再出现；改不存在的 id 返回 null', () => {
    const rule = addRule(PARENT, '可改班', '09:00', '18:00');
    const updated = updateDeptShiftRule(rule.id, { name: '可改班', startTime: '08:30', endTime: '17:30', workdays: [1, 2, 3, 4, 5, 6] });
    expect(updated).toMatchObject({ startTime: '08:30', endTime: '17:30' });
    expect(updated?.workdays).toContain(6);
    expect(deleteDeptShiftRule(rule.id)).toBe(true);
    expect(listDeptShiftRules().some((r) => r.id === rule.id)).toBe(false);
    expect(updateDeptShiftRule('qa-shift-nope', { name: 'x', startTime: '09:00', endTime: '10:00', workdays: [1] })).toBeNull();
  });
});

describe('继承', () => {
  it('分部没配时用总部的；分部自己配了就用分部的；都不存在时返回空', () => {
    clearRules();
    addRule(PARENT, '总部班', '09:00', '18:00');
    const fromParent = resolveRulesForDepartment(CHILD);
    expect(fromParent.rules.map((r) => r.name)).toEqual(['总部班']);
    expect(fromParent).toMatchObject({ sourceDepartmentId: PARENT, sourceDepartmentName: 'QA对班总部', depth: 1 });

    addRule(CHILD, '分部班', '08:30', '17:30');
    const own = resolveRulesForDepartment(CHILD);
    expect(own.rules.map((r) => r.name)).toEqual(['分部班']);
    expect(own.depth).toBe(0);

    expect(resolveRulesForDepartment('qa-shift-missing-dept')).toMatchObject({ rules: [], sourceDepartmentId: null });
    clearRules();
  });
});

describe('判定与覆盖率', () => {
  it('部门时段一生效就压过逐日排班，说明里写清用的是哪个部门的时段', () => {
    clearRules();
    clearPunches();
    addRule(CHILD, '分部班', '09:00', '18:00');
    const nightShift = createShift({ name: 'QA对班晚班', startTime: '13:00', endTime: '21:00' });
    upsertSchedule({ employeeId: empChild.id, employeeName: empChild.name, shiftIds: [nightShift.id] });
    punch(empChild, MON, '09:20:00', '18:00:00');

    const { coverage } = analyzeAttendance();
    expect(coverage.bySchedule).toBe(0);
    expect(coverage.byRule).toBeGreaterThanOrEqual(1);
    const rows = anomaliesOf(empChild.id);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].description)).toContain('迟到 20 分钟');
    expect(String(rows[0].description)).toContain('QA对班分部');
    expect(String(rows[0].description)).not.toContain('QA对班晚班');

    deleteSchedule(empChild.id);
    deleteShift(nightShift.id);
    clearRules();
    clearPunches();
  });

  it('对不上班与无判定依据都进 coverage，并给出可读原因', () => {
    clearRules();
    clearPunches();
    addRule(PARENT, '总部班', '09:00', '18:00');
    punch(empParent, MON, '16:00:00', '17:00:00'); // 首卡差 420 分钟 → 不判
    punch(empNoDept, MON, '09:05:00', '18:00:00'); // 无部门无排班 → 无依据
    const { anomalies, coverage } = analyzeAttendance();
    expect(coverage.days).toBe(2);
    expect(coverage.unmatched).toBe(1);
    expect(coverage.noPlan).toBe(1);
    expect(anomalies.filter((a) => a.employeeId === empParent.id || a.employeeId === empNoDept.id)).toEqual([]);
    const reasons = coverage.unmatchedSample.map((s) => s.reason).join('；');
    expect(reasons).toMatch(/未对上任何班/u);
    expect(reasons).toMatch(/无判定依据/u);
    clearRules();
    clearPunches();
  });

  it('周六没配班则不判；配了周六班才按它判缺下班卡', () => {
    clearRules();
    clearPunches();
    addRule(PARENT, '总部班', '09:00', '18:00');
    punch(empParent, SAT, '10:30:00');
    let res = analyzeAttendance();
    expect(res.anomalies.filter((a) => a.date === SAT)).toEqual([]);
    expect(res.coverage.unmatched).toBe(1);

    clearRules();
    addRule(PARENT, '周六班', '09:00', '12:00', [6]);
    res = analyzeAttendance();
    const saturday = res.anomalies.find((a) => a.date === SAT);
    expect(saturday?.type).toBe('MISSING_OUT');
    expect(saturday?.description).toContain('周六班');
    clearRules();
    clearPunches();
  });

  it('月报走同一份判定：迟到与早退各记一次', () => {
    clearRules();
    clearPunches();
    addRule(PARENT, '总部班', '09:00', '18:00');
    punch(empParent, MON, '09:20:00', '17:00:00');
    const row = monthlySummary('2026-09').find((r) => r.employeeId === empParent.id);
    expect(row).toMatchObject({ workDays: 1, punchCount: 2, lateCount: 1, earlyLeaveCount: 1, missingCount: 0 });
    expect(row?.department).toBe('QA对班总部');
    clearRules();
    clearPunches();
  });
});

describe('/api/attendance/shift-rules HTTP 层（真 authGate）', () => {
  let server: Server;
  let origin = '';
  let adminToken = '';
  let empToken = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api', authGate);
    app.use('/api/attendance', attendanceRouter);
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/attendance`;
    for (const u of ['shift-rule-admin', 'shift-rule-emp']) deleteAccount(u);
    createAccount({ username: 'shift-rule-admin', password: PW, systemRole: 'SUPER_ADMIN' });
    createAccount({ username: 'shift-rule-emp', password: PW, systemRole: 'EMPLOYEE' });
    adminToken = createSession('shift-rule-admin', '127.0.0.1', 'vitest').token;
    empToken = createSession('shift-rule-emp', '127.0.0.1', 'vitest').token;
  });

  afterAll(async () => {
    clearRules();
    deleteAccount('shift-rule-admin');
    deleteAccount('shift-rule-emp');
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function call(method: string, path: string, token?: string, body?: unknown) {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON */
    }
    return { status: res.status, json };
  }

  it('未登录 401；EMPLOYEE 写不进（写策略默认 HR+）；管理员可增查改删且错误是 400 不是 500', async () => {
    expect((await call('GET', '/shift-rules')).status).toBe(401);
    expect(
      (
        await call('POST', '/shift-rules', empToken, {
          departmentId: PARENT,
          name: '越权班',
          startTime: '09:00',
          endTime: '18:00',
          workdays: [1],
        })
      ).status
    ).toBe(403);

    const created = await call('POST', '/shift-rules', adminToken, {
      departmentId: PARENT,
      name: '接口班',
      startTime: '09:00',
      endTime: '18:00',
      workdays: [1, 2, 3, 4, 5],
    });
    expect(created.status).toBe(201);
    const id = (created.json as { id: string }).id;


    const bad = await call('POST', '/shift-rules', adminToken, {
      departmentId: PARENT,
      name: '夜班',
      startTime: '20:00',
      endTime: '06:00',
      workdays: [1],
    });
    expect(bad.status).toBe(400);
    expect((bad.json as { error: string }).error).toMatch(/跨夜班/u);

    const updated = await call('PUT', `/shift-rules/${id}`, adminToken, {
      name: '接口班改',
      startTime: '08:30',
      endTime: '17:30',
      workdays: [1, 2, 3, 4, 5, 6],
    });
    expect((updated.json as { name: string }).name).toBe('接口班改');

    const eff = await call('GET', `/shift-rules/effective?departmentId=${CHILD}`, adminToken);
    expect((eff.json as { inherited: boolean }).inherited).toBe(true);
    expect((eff.json as { rules: { name: string }[] }).rules[0].name).toBe('接口班改');

    expect((await call('DELETE', `/shift-rules/${id}`, adminToken)).status).toBe(200);
    expect((await call('DELETE', '/shift-rules/qa-shift-nope', adminToken)).status).toBe(404);
  });

  it('分析接口带 coverage，供界面说明"为什么没有异常"', async () => {
    clearRules();
    clearPunches();
    addRule(PARENT, '总部班', '09:00', '18:00');
    punch(empParent, MON, '09:40:00', '18:10:00');
    const res = await call('POST', '/analyze', adminToken);
    expect(res.status).toBe(200);
    const coverage = (res.json as { coverage: { days: number; byRule: number; unmatched: number } }).coverage;
    expect(coverage.days).toBeGreaterThanOrEqual(1);
    expect(coverage.byRule).toBeGreaterThanOrEqual(1);
    const late = (res.json as { anomalies: { employeeId: string; type: string }[] }).anomalies.find(
      (a) => a.employeeId === empParent.id
    );
    expect(late?.type).toBe('LATE_15');

    // 留档：另一次请求（相当于刷新页面 / 换设备）仍能看到这次分析的覆盖率
    const status = (await call('GET', '/anomalies/status', adminToken)).json as {
      at: string | null;
      coverage: { days: number; byRule: number } | null;
    };
    expect(status.at).toBeTruthy();
    expect(status.coverage?.byRule).toBe(coverage.byRule);
    clearRules();
    clearPunches();
  });
});
