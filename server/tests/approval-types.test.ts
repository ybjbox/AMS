/**
 * 审批类型规格表（server/approvalTypes.ts）的回归 —— 这批是**纯重构**，
 * 所以断言的目标不是"新行为对不对"，而是"旧行为有没有任何一处被改掉了"：
 * 每一条错误文案、每一条通知文案、每一个归一化结果都按重构前 approvalsRouter /
 * approvalsDb 里的字面量钉住。将来谁再动文案，这里会红。
 *
 * 另加两条结构性守卫：五类必须都在 APPROVAL_TYPES 与 DOMAIN_ACTIONS 里显式存在
 * （原来加一类只要忘记改 if 链，通过后就静默什么都不做）。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createEmployee, db, deleteEmployee } from '../db.ts';
import { createAccount, createSession, deleteAccount } from '../authDb.ts';
import { authGate } from '../authMiddleware.ts';
import { approvalsRouter } from '../approvalsRouter.ts';
import { domainActionOf, type ApprovalRow } from '../approvalsDb.ts';
import {
  APPROVAL_KINDS,
  APPROVAL_TYPES,
  approvalKindOf,
  leaveDaysBetween,
  type ApplicantContext,
  type ApprovalInput,
  type ApprovalTypeSpec,
} from '../approvalTypes.ts';

function row(overrides: Partial<ApprovalRow>): ApprovalRow {
  return {
    id: 'r1',
    applicant: 'staff-a',
    type: 'leave',
    leaveType: '事假',
    startDate: '2026-09-21',
    endDate: null,
    reason: '家中有事',
    status: 'approved',
    approver: 'hr',
    comment: '',
    createdAt: '2026-09-20 10:00:00',
    decidedAt: null,
    punchDate: '',
    punchTime: '',
    punchKind: '',
    requiredRole: 'HR',
    hours: 0,
    ...overrides,
  };
}

function ctx(overrides: Partial<ApplicantContext> = {}): ApplicantContext {
  return {
    username: 'staff-a',
    employeeId: () => null,
    employeeStatus: () => '',
    compLedgerHours: () => 0,
    pendingCompHours: () => 0,
    today: () => '2026-09-23',
    ...overrides,
  };
}

function spec(kind: (typeof APPROVAL_KINDS)[number]): ApprovalTypeSpec {
  return APPROVAL_TYPES[kind];
}

describe('类型规格表结构', () => {
  it('五类都有完整规格，且未识别的 type 回退为请假（与重构前的默认分支一致）', () => {
    expect([...APPROVAL_KINDS].sort()).toEqual(['conversion', 'leave', 'makeup', 'overtime', 'resign']);
    for (const kind of APPROVAL_KINDS) {
      const s = spec(kind);
      expect(s.kind).toBe(kind);
      expect(s.label(row({ type: kind }))).toBeTruthy();
      expect(typeof s.toDraft).toBe('function');
      expect(typeof s.requiredRole).toBe('function');
      expect(typeof s.notify(row({ type: kind })).subject).toBe('string');
      expect(typeof s.notify(row({ type: kind })).detail).toBe('string');
    }
    expect(approvalKindOf(undefined)).toBe('leave');
    expect(approvalKindOf('nonsense')).toBe('leave');
    expect(approvalKindOf('makeup')).toBe('makeup');
  });

  it('每个类型都必须对领域动作显式表态（函数或 null），不允许静默漏掉', () => {
    for (const kind of APPROVAL_KINDS) {
      const action = domainActionOf(kind);
      expect(action === undefined).toBe(false);
      expect(action === null || typeof action === 'function').toBe(true);
    }
  });
});

describe('标签与通知文案逐字不变', () => {
  const cases: Array<{ input: ApprovalInput; expectRow: ApprovalRow; title: string; message: string }> = [
    {
      input: { type: 'leave', leaveType: '事假' },
      expectRow: row({ type: 'leave', leaveType: '事假', startDate: '2026-09-21' }),
      title: '你的事假申请已通过',
      message: '2026-09-21 提交的申请，审批人：admin',
    },
    {
      input: { type: 'makeup', punchKind: '上班卡' },
      expectRow: row({ type: 'makeup', leaveType: '补卡', punchKind: '上班卡', punchDate: '2026-09-19', punchTime: '09:00' }),
      title: '你的上班卡申请已通过',
      message: '2026-09-19 09:00 的补卡，审批人：admin',
    },
    {
      input: { type: 'conversion' },
      expectRow: row({ type: 'conversion', leaveType: '转正', startDate: '2026-09-23' }),
      title: '你的转正申请已通过',
      message: '2026-09-23 提交的申请，审批人：admin',
    },
    {
      input: { type: 'resign' },
      expectRow: row({ type: 'resign', leaveType: '离职', startDate: '2026-09-30' }),
      title: '你的离职申请已通过',
      message: '最后工作日 2026-09-30，审批人：admin',
    },
    {
      input: { type: 'overtime' },
      expectRow: row({ type: 'overtime', leaveType: '加班', startDate: '2026-09-21', hours: 8 }),
      title: '你的加班申请（8 小时）已通过',
      message: '2026-09-21 共 8 小时，已计入调休额度，审批人：admin',
    },
  ];

  for (const c of cases) {
    it(`${c.input.type}：标题与正文与重构前逐字一致`, () => {
      const { subject, detail } = spec(approvalKindOf(c.input.type)).notify(c.expectRow);
      expect(`${subject}已通过`).toBe(c.title);
      expect(`${detail}，审批人：admin`).toBe(c.message);
    });
  }

  it('驳回时只有动词不同，意见存在时追加', () => {
    const { subject, detail } = spec('leave').notify(row({}));
    expect(`${subject}被驳回`).toBe('你的事假申请被驳回');
    expect(`${detail}，审批人：admin，意见：材料不足`).toBe('2026-09-21 提交的申请，审批人：admin，意见：材料不足');
  });

  it('列表标题：四类显示类型名，请假显示假别', () => {
    expect(spec('makeup').label(row({ type: 'makeup', leaveType: '补卡' }))).toBe('补卡');
    expect(spec('conversion').label(row({}))).toBe('转正');
    expect(spec('resign').label(row({}))).toBe('离职');
    expect(spec('overtime').label(row({}))).toBe('加班');
    expect(spec('leave').label(row({ leaveType: '病假' }))).toBe('病假');
  });
});

describe('提交校验与归一化逐字不变', () => {
  it('补卡：缺任一字段即整条拒绝，且 startDate 复用为补卡日期', () => {
    const missing = spec('makeup').toDraft({ reason: '忘打卡' }, ctx());
    expect(missing).toEqual({ ok: false, error: '补卡申请需填写日期、时间与卡类型' });
    const ok = spec('makeup').toDraft(
      { reason: '忘打卡', punchDate: '2026-09-19', punchTime: '09:00', punchKind: '上班卡' },
      ctx()
    );
    expect(ok).toEqual({
      ok: true,
      draft: {
        type: 'makeup',
        leaveType: '补卡',
        startDate: '2026-09-19',
        endDate: null,
        reason: '忘打卡',
        punchDate: '2026-09-19',
        punchTime: '09:00',
        punchKind: '上班卡',
      },
    });
  });

  it('转正：未关联档案与不在试用期两种拒绝文案', () => {
    expect(spec('conversion').toDraft({ reason: '申请转正' }, ctx())).toEqual({
      ok: false,
      error: '你的账号未关联员工档案，无法申请转正',
    });
    expect(
      spec('conversion').toDraft({ reason: '申请转正' }, ctx({ employeeId: () => 'EMP0001', employeeStatus: () => '在职' }))
    ).toEqual({ ok: false, error: '当前员工状态不是试用期，无需转正申请' });
    expect(
      spec('conversion').toDraft({ reason: '申请转正' }, ctx({ employeeId: () => 'EMP0001', employeeStatus: () => '试用期' }))
    ).toEqual({
      ok: true,
      draft: { type: 'conversion', leaveType: '转正', startDate: '2026-09-23', endDate: null, reason: '申请转正' },
    });
  });

  it('离职缺最后工作日；加班缺日期与时长越界', () => {
    expect(spec('resign').toDraft({ reason: '个人原因' }, ctx())).toEqual({ ok: false, error: '请填写最后工作日' });
    expect(spec('overtime').toDraft({ reason: '赶项目' }, ctx())).toEqual({ ok: false, error: '请填写加班日期' });
    for (const hours of [0, -1, 25, 'abc']) {
      expect(spec('overtime').toDraft({ reason: '赶项目', startDate: '2026-09-21', hours: hours as never }, ctx())).toEqual({
        ok: false,
        error: '加班时长需为 0~24 之间的数字（小时）',
      });
    }
  });

  it('加班时长按半小时取整（7.74 → 7.5，7.8 → 8）', () => {
    const half = spec('overtime').toDraft({ reason: 'x', startDate: '2026-09-21', hours: 7.74 }, ctx());
    const round = spec('overtime').toDraft({ reason: 'x', startDate: '2026-09-21', hours: 7.8 }, ctx());
    expect(half.ok && half.draft.hours).toBe(7.5);
    expect(round.ok && round.draft.hours).toBe(8);
  });

  it('请假缺开始日期；假别缺省为事假', () => {
    expect(spec('leave').toDraft({ reason: '家中有事' }, ctx())).toEqual({ ok: false, error: '开始日期不能为空' });
    const ok = spec('leave').toDraft({ startDate: '2026-09-21', reason: '家中有事' }, ctx());
    expect(ok.ok && ok.draft.leaveType).toBe('事假');
  });

  it('调休余额不足的文案与 code 逐字一致（含待审占用）', () => {
    const res = spec('leave').toDraft(
      { startDate: '2026-09-21', endDate: '2026-09-23', leaveType: '调休', reason: '调休' },
      ctx({ employeeId: () => 'EMP0001', compLedgerHours: () => 12, pendingCompHours: () => 4 })
    );
    expect(res).toEqual({
      ok: false,
      error: '调休余额不足：需 3 天（24h），当前可用 8h（另有 4h 待审批占用）',
      code: 'COMP_BALANCE_INSUFFICIENT',
    });
  });

  it('天数口径：含首尾、无结束日期按 1 天、倒序也按 1 天', () => {
    expect(leaveDaysBetween('2026-09-21', '2026-09-23')).toBe(3);
    expect(leaveDaysBetween('2026-09-21')).toBe(1);
    expect(leaveDaysBetween('2026-09-23', '2026-09-21')).toBe(1);
  });
});

describe('审批门槛', () => {
  it('请假满 3 天升 ADMIN，2 天与不填结束日期仍是 HR；其它类型一律 HR', () => {
    expect(spec('leave').requiredRole({ startDate: '2026-09-21', endDate: '2026-09-23' })).toBe('ADMIN');
    expect(spec('leave').requiredRole({ startDate: '2026-09-21', endDate: '2026-09-22' })).toBe('HR');
    expect(spec('leave').requiredRole({ startDate: '2026-09-21' })).toBe('HR');
    for (const kind of ['makeup', 'conversion', 'resign', 'overtime'] as const) {
      expect(spec(kind).requiredRole({ startDate: '2026-09-21', endDate: '2026-12-31' })).toBe('HR');
    }
  });

  it('createApproval 沿用同一门槛（落库 requiredRole 与重构前一致）', async () => {
    const { createApproval } = await import('../approvalsDb.ts');
    const long = createApproval({ applicant: 'staff-a', type: 'leave', startDate: '2026-09-21', endDate: '2026-09-24', reason: 'x' });
    const short = createApproval({ applicant: 'staff-a', type: 'leave', startDate: '2026-09-21', endDate: '2026-09-22', reason: 'x' });
    expect([long.requiredRole, short.requiredRole]).toEqual(['ADMIN', 'HR']);
    db.prepare('DELETE FROM approvals WHERE id IN (?, ?)').run(long.id, short.id);
  });
});

describe('POST /api/approvals 端到端（真 authGate，五类各一条）', () => {
  let server: Server;
  let origin = '';
  let token = '';
  let trialEmployeeId = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api', authGate);
    app.use('/api/approvals', approvalsRouter);
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/approvals`;
    deleteAccount('appr-spec-staff');
    createAccount({ username: 'appr-spec-staff', password: 'Appr#Test2026-aa', systemRole: 'EMPLOYEE' });
    token = createSession('appr-spec-staff', '127.0.0.1', 'vitest').token;
    const emp = createEmployee({ name: '审批规格测试·试用期', status: '试用期' })!;
    trialEmployeeId = emp.id;
    db.prepare("UPDATE accounts SET employeeId = ? WHERE username = 'appr-spec-staff'").run(trialEmployeeId);
  });

  afterAll(async () => {
    db.prepare('DELETE FROM approvals WHERE applicant = ?').run('appr-spec-staff');
    db.prepare('UPDATE accounts SET employeeId = NULL WHERE username = ?').run('appr-spec-staff');
    deleteAccount('appr-spec-staff');
    if (trialEmployeeId) deleteEmployee(trialEmployeeId);
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function submit(body: Record<string, unknown>) {
    const res = await fetch(`${origin}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it('五类提交都返回 201，落库字段与重构前的分支结果一致', async () => {
    const leave = await submit({ type: 'leave', leaveType: '年假', startDate: '2026-10-08', endDate: '2026-10-09', reason: '年假两天' });
    expect(leave.status).toBe(201);
    expect(leave.json).toMatchObject({ type: 'leave', leaveType: '年假', status: 'pending', requiredRole: 'HR' });

    const makeup = await submit({ type: 'makeup', punchDate: '2026-10-01', punchTime: '09:00', punchKind: '上班卡', reason: '忘打卡' });
    expect(makeup.json).toMatchObject({ type: 'makeup', leaveType: '补卡', startDate: '2026-10-01', punchTime: '09:00' });

    const conversion = await submit({ type: 'conversion', reason: '试用期满' });
    expect(conversion.status).toBe(201);
    expect(conversion.json).toMatchObject({ type: 'conversion', leaveType: '转正' });
    // 转正日期必须是**本地**今天：曾用 toISOString() 取 UTC 日，北京时间 08:00 前会写成昨天
    expect(conversion.json.startDate).toBe(new Date().toLocaleDateString('sv-SE'));

    const resign = await submit({ type: 'resign', startDate: '2026-10-31', reason: '个人原因' });
    expect(resign.json).toMatchObject({ type: 'resign', leaveType: '离职', startDate: '2026-10-31' });

    const overtime = await submit({ type: 'overtime', startDate: '2026-10-02', hours: 7.74, reason: '赶项目' });
    expect(overtime.json).toMatchObject({ type: 'overtime', leaveType: '加班', hours: 7.5 });
  });

  it('错误分支的中文文案逐字不变', async () => {
    expect(await submit({ type: 'makeup', reason: '忘打卡' })).toMatchObject({
      status: 400,
      json: { error: '补卡申请需填写日期、时间与卡类型' },
    });
    expect(await submit({ type: 'overtime', reason: 'x' })).toMatchObject({
      status: 400,
      json: { error: '请填写加班日期' },
    });
    expect(await submit({ type: 'resign', reason: 'x' })).toMatchObject({
      status: 400,
      json: { error: '请填写最后工作日' },
    });
    expect(await submit({ startDate: '2026-10-05', reason: '' })).toMatchObject({ status: 400 });
  });

  it('未登录仍然 401（策略没被动过）', async () => {
    const res = await fetch(`${origin}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'leave', startDate: '2026-10-05', reason: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});
