import { acct } from '../runScoped';
import { test, expect } from '@playwright/test';
import { resolveAdminPassword } from '../adminCredentials';

/**
 * P2 功能闭环 E2E：
 * 1. 多级审批：≥3 天请假 HR 决定被拦（403）→ ADMIN 终审通过；自审拦截
 * 2. 加班闭环：申请 → 审批 → 计入调休台账；调休余额校验（不足 400 / 足够 201）
 * 3. 异常通知：分析接口返回 notified 计数
 * 4. 考勤看板：/stats/attendance 结构（30 天热力 + 部门出勤率）
 */

const ADMIN_PASSWORD = resolveAdminPassword();
const PW_1 = 'E2e-P2#2026a';
const MLV_ACCOUNT = acct('e2e-mlv');
const HR2_ACCOUNT = acct('e2e-hr2');
const OT_ACCOUNT = acct('e2e-ot');
const PW_2 = 'E2e-P2#2026b';

async function login(
  request: import('@playwright/test').APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post('/api/auth/login', { data: { username, password } });
  expect(res.status(), `登录 ${username}`).toBe(200);
  const body = await res.json();
  let token: string = body.token;
  if (body.user?.mustChangePassword) {
    const ch = await request.post('/api/auth/change-password', {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPassword: password, newPassword: PW_2 },
    });
    expect(ch.status()).toBe(200);
    token = (await ch.json()).token ?? token;
  }
  return token;
}

/** 创建测试员工 + 关联账号 */
async function createLinkedEmployee(
  request: import('@playwright/test').APIRequestContext,
  adminToken: string,
  opts: { account: string; name: string; idCard: string; systemRole?: string }
): Promise<{ employeeId: string; token: string }> {
  const auth = { Authorization: `Bearer ${adminToken}` };
  await request.delete(`/api/auth/accounts/${opts.account}`, { headers: auth });

  const empRes = await request.post('/api/users', {
    headers: auth,
    data: {
      name: opts.name,
      idCard: opts.idCard,
      gender: '男',
      age: 28,
      phone: '13300005555',
      department: '研发部',
      status: '在职',
      joinDate: '2026-07-01',
      employmentType: '正式',
    },
  });
  expect(empRes.status(), `创建员工 ${opts.name}`).toBe(201);
  const employeeId = (await empRes.json()).id;

  const accRes = await request.post('/api/auth/accounts', {
    headers: auth,
    data: {
      username: opts.account,
      password: PW_1,
      systemRole: opts.systemRole ?? 'EMPLOYEE',
      displayName: opts.name,
      employeeId,
    },
  });
  expect(accRes.status(), `创建账号 ${opts.account}`).toBe(201);

  const token = await login(request, opts.account, PW_1);
  return { employeeId, token };
}

test.describe.serial('P2 功能闭环', () => {
  let adminToken = '';

  test.beforeAll(async ({ request }) => {
    adminToken = await login(request, 'admin', ADMIN_PASSWORD);
  });

  test('多级审批：≥3 天请假 HR 被拦 → ADMIN 终审；自审被拦', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    // 员工（提交 ≥3 天请假）+ HR 账号（尝试初审）
    const emp = await createLinkedEmployee(request, adminToken, {
      account: MLV_ACCOUNT,
      name: 'E2E多级员工',
      idCard: '110101199705055555',
    });
    const hr = await createLinkedEmployee(request, adminToken, {
      account: HR2_ACCOUNT,
      name: 'E2E多级HR',
      idCard: '110101199706066666',
      systemRole: 'HR',
    });

    // 1) 员工提交 3 天请假（今天起 3 天）
    const start = new Date();
    const end = new Date(start.getTime() + 2 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const apply = await request.post('/api/approvals', {
      headers: { Authorization: `Bearer ${emp.token}` },
      data: { type: 'leave', leaveType: '事假', startDate: fmt(start), endDate: fmt(end), reason: 'E2E：三天事假' },
    });
    expect(apply.status()).toBe(201);
    const approval = await apply.json();
    expect(approval.requiredRole, '≥3 天应升 ADMIN 终审').toBe('ADMIN');

    // 2) HR 决定被拦（403 APPROVAL_FORBIDDEN）
    const hrDecide = await request.put(`/api/approvals/${approval.id}/decide`, {
      headers: { Authorization: `Bearer ${hr.token}` },
      data: { status: 'approved', comment: 'HR 初审' },
    });
    expect(hrDecide.status(), 'HR 决定 ≥3 天请假应 403').toBe(403);
    expect((await hrDecide.json()).code).toBe('APPROVAL_FORBIDDEN');

    // 3) ADMIN 终审通过
    const adminDecide = await request.put(`/api/approvals/${approval.id}/decide`, {
      headers: auth,
      data: { status: 'approved', comment: '终审通过' },
    });
    expect(adminDecide.status()).toBe(200);

    // 4) 自审拦截：HR 给自己提交 1 天假，自己决定 → 403
    const selfApply = await request.post('/api/approvals', {
      headers: { Authorization: `Bearer ${hr.token}` },
      data: { type: 'leave', leaveType: '年假', startDate: fmt(start), reason: 'E2E：自审测试' },
    });
    expect(selfApply.status()).toBe(201);
    const selfApproval = await selfApply.json();
    const selfDecide = await request.put(`/api/approvals/${selfApproval.id}/decide`, {
      headers: { Authorization: `Bearer ${hr.token}` },
      data: { status: 'rejected', comment: '自己驳回自己' },
    });
    expect(selfDecide.status(), '自审应 403').toBe(403);
    // 清理：admin 驳回该申请（走业务流程留痕）
    await request.put(`/api/approvals/${selfApproval.id}/decide`, {
      headers: auth,
      data: { status: 'rejected', comment: 'E2E 清理' },
    });

    // 清理账号与员工
    await request.delete(`/api/auth/accounts/${MLV_ACCOUNT}`, { headers: auth });
    await request.delete(`/api/auth/accounts/${HR2_ACCOUNT}`, { headers: auth });
    await request.delete(`/api/users/${emp.employeeId}`, { headers: auth });
    await request.delete(`/api/users/${hr.employeeId}`, { headers: auth });
  });

  test('加班闭环：审批计入调休台账 + 调休余额校验', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const emp = await createLinkedEmployee(request, adminToken, {
      account: OT_ACCOUNT,
      name: 'E2E加班员工',
      idCard: '110101199707077777',
    });
    const empAuth = { Authorization: `Bearer ${emp.token}` };
    const today = new Date().toISOString().slice(0, 10);

    // 1) 调休余额为 0：申请 1 天调休 → 400
    const compZero = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'leave', leaveType: '调休', startDate: today, reason: 'E2E：余额不足测试' },
    });
    expect(compZero.status(), '无余额调休应 400').toBe(400);
    expect((await compZero.json()).code).toBe('COMP_BALANCE_INSUFFICIENT');

    // 2) 提交加班 8h → ADMIN 审批通过 → 台账 +8h
    const ot = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'overtime', startDate: today, hours: 8, reason: 'E2E：项目上线加班' },
    });
    expect(ot.status(), '提交加班').toBe(201);
    const otRow = await ot.json();
    expect(otRow.hours).toBe(8);
    const otDecide = await request.put(`/api/approvals/${otRow.id}/decide`, {
      headers: auth,
      data: { status: 'approved', comment: 'E2E 通过' },
    });
    expect(otDecide.status()).toBe(200);

    // 3) 现在余额 8h：1 天调休可提交（201）
    const compOk = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'leave', leaveType: '调休', startDate: today, reason: 'E2E：余额充足调休' },
    });
    expect(compOk.status(), '1 天调休（8h 余额）应 201').toBe(201);
    const compRow = await compOk.json();
    // 清理：admin 驳回（留痕）
    await request.put(`/api/approvals/${compRow.id}/decide`, {
      headers: auth,
      data: { status: 'rejected', comment: 'E2E 清理' },
    });

    // 4) 2 天调休仍不足（余额 8h < 16h）→ 400
    const end2 = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const compBig = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'leave', leaveType: '调休', startDate: today, endDate: end2, reason: 'E2E：超额调休' },
    });
    expect(compBig.status(), '2 天调休应 400').toBe(400);

    // 5) 加班参数校验：0 或 >24 小时 → 400
    const otBad = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'overtime', startDate: today, hours: 30, reason: 'E2E：非法时长' },
    });
    expect(otBad.status(), '超 24h 加班应 400').toBe(400);

    // 清理
    await request.delete(`/api/auth/accounts/${OT_ACCOUNT}`, { headers: auth });
    await request.delete(`/api/users/${emp.employeeId}`, { headers: auth });
  });

  test('考勤异常通知：分析接口返回通知计数', async ({ request }) => {
    const res = await request.post('/api/attendance/analyze', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.notified).toBe('number');
    expect(body.notified).toBeGreaterThanOrEqual(0);
  });

  test('考勤看板：30 天热力 + 部门出勤率结构', async ({ request }) => {
    const res = await request.get('/api/stats/attendance', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.days)).toBe(true);
    expect(data.days.length).toBe(30);
    const d = data.days[0];
    for (const k of ['date', 'present', 'late', 'early', 'missing', 'scheduled']) {
      expect(d, `字段 ${k} 存在`).toHaveProperty(k);
    }
    expect(Array.isArray(data.departmentRates)).toBe(true);
    if (data.departmentRates.length > 0) {
      const r = data.departmentRates[0];
      expect(typeof r.name).toBe('string');
      expect(typeof r.rate).toBe('number');
      expect(r.rate).toBeGreaterThanOrEqual(0);
      expect(r.rate).toBeLessThanOrEqual(100);
    }
  });
});
