import { acct } from '../runScoped';
import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { resolveAdminPassword } from '../adminCredentials';

/**
 * P1 功能闭环 E2E：
 * 1. 员工批量导入：模板下载 → 生成 xlsx → 预览（错误/重复检测）→ 提交 → 清理
 * 2. 转正流程：试用期员工申请 → 审批通过 → 状态自动转「在职」
 * 3. 离职流程：申请 → 审批通过 → 状态「离职」+ 账号停用 + 会话吊销
 * 4. 合同续签：续签 → 台账更新 + 历史留痕
 * 5. 人员流动统计：结构与数据完整
 */

const ADMIN_PASSWORD = resolveAdminPassword();
const PW_1 = 'E2e-P1#2026a';
const CONV_ACCOUNT = acct('e2e-conv');
const RESIGN_ACCOUNT = acct('e2e-resign');
const PW_2 = 'E2e-P1#2026b';

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

/** 创建测试员工 + 关联账号，返回 { employeeId, token } */
async function createLinkedEmployee(
  request: import('@playwright/test').APIRequestContext,
  adminToken: string,
  opts: { account: string; name: string; idCard: string; status?: string }
): Promise<{ employeeId: string; token: string }> {
  const auth = { Authorization: `Bearer ${adminToken}` };
  // 清理残留
  await request.delete(`/api/auth/accounts/${opts.account}`, { headers: auth });

  const empRes = await request.post('/api/users', {
    headers: auth,
    data: {
      name: opts.name,
      idCard: opts.idCard,
      gender: '男',
      age: 30,
      phone: '13300008888',
      department: '研发部',
      status: opts.status ?? '试用期',
      joinDate: '2026-08-01',
      employmentType: '正式',
    },
  });
  expect(empRes.status(), `创建员工 ${opts.name}`).toBe(201);
  const employeeId = (await empRes.json()).id;

  const accRes = await request.post('/api/auth/accounts', {
    headers: auth,
    data: { username: opts.account, password: PW_1, systemRole: 'EMPLOYEE', displayName: opts.name, employeeId },
  });
  expect(accRes.status(), `创建账号 ${opts.account}`).toBe(201);

  const token = await login(request, opts.account, PW_1);
  return { employeeId, token };
}

test.describe.serial('P1 功能闭环', () => {
  let adminToken = '';

  test.beforeAll(async ({ request }) => {
    adminToken = await login(request, 'admin', ADMIN_PASSWORD);
  });

  // ---------- P1-1 批量导入 ----------
  test('员工批量导入：预览检出错误/重复 → 提交落库 → 清理', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // 1) 模板可下载
    const tmpl = await request.get('/api/users/import/template', { headers: auth });
    expect(tmpl.status()).toBe(200);

    // 2) 生成测试文件：1 有效 + 1 缺电话 + 1 文件内重复 + 1 部门不存在
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('员工导入');
    ws.addRow(['姓名', '身份证号', '性别', '年龄', '电话', '部门', '职位', '状态', '入职日期', '用工形式']);
    const stamp = Date.now().toString().slice(-6);
    ws.addRow(['E2E导入甲', `11010119${stamp}1111`, '男', 31, '13800001111', '研发部', '测试工程师', '在职', '2026-09-01', '正式']);
    ws.addRow(['E2E导入乙', `11010119${stamp}2222`, '女', 28, '', '研发部', '', '在职', '2026-09-01', '']);
    ws.addRow(['E2E导入丙', `11010119${stamp}1111`, '男', 31, '13800002222', '研发部', '', '在职', '2026-09-01', '']);
    ws.addRow(['E2E导入丁', `11010119${stamp}3333`, '女', 30, '13800003333', '不存在部门X', '', '在职', '2026-09-01', '']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    // 3) 预览
    const previewRes = await request.post('/api/users/import', {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/octet-stream' },
      data: buffer,
    });
    expect(previewRes.status(), '预览').toBe(200);
    const preview = await previewRes.json();
    expect(preview.total).toBe(4);
    expect(preview.valid, '应有 1 行可导入').toBe(1);
    expect(preview.invalid, '应有 2 行错误').toBe(2);
    expect(preview.duplicates, '应有 1 行重复').toBe(1);
    const dupRow = preview.rows.find((r: { duplicate: boolean }) => r.duplicate);
    expect(dupRow.errors.join('')).toContain('重复');
    const deptRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 5);
    expect(deptRow.errors.join('')).toContain('不存在');

    // 4) 提交有效行：异步导入（#16），立即返回 202 + jobId，后台分块落库
    const validRows = preview.rows.filter((r: { errors: string[] }) => r.errors.length === 0);
    const commitRes = await request.post('/api/users/import/commit', {
      headers: auth,
      data: { rows: validRows },
    });
    expect(commitRes.status(), '提交').toBe(202);
    const { jobId } = await commitRes.json();
    expect(jobId, '应返回 jobId').toBeTruthy();

    // 轮询任务直到完成
    let job = null;
    for (let i = 0; i < 50; i++) {
      const jobRes = await request.get(`/api/users/import/jobs/${jobId}`, { headers: auth });
      expect(jobRes.status(), '查询导入任务').toBe(200);
      job = await jobRes.json();
      if (job.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(job.status, `导入任务应完成（error: ${job.error}）`).toBe('done');
    expect(job.processed).toBe(1);
    expect(job.created).toBe(1);
    expect(job.skipped).toBe(0);

    // 5) 验证落库 + 清理（按姓名搜索后用身份证号精确匹配取回 id）
    const listRes = await request.get('/api/users?keyword=' + encodeURIComponent('E2E导入甲'), { headers: auth });
    expect(listRes.status()).toBe(200);
    const found = (await listRes.json()).find(
      (u: { idCard?: string }) => u.idCard === `11010119${stamp}1111`
    );
    expect(found, '导入的员工应已落库').toBeTruthy();
    expect(found.name).toBe('E2E导入甲');
    const detail = await request.get(`/api/users/${found.id}`, { headers: auth });
    expect(detail.status()).toBe(200);

    const del = await request.delete(`/api/users/${found.id}`, { headers: auth });
    expect(del.status()).toBe(200);
  });

  // ---------- P1-2 转正流程 ----------
  test('转正流程：试用期员工申请 → 审批通过 → 状态自动转「在职」', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { employeeId, token } = await createLinkedEmployee(request, adminToken, {
      account: CONV_ACCOUNT,
      name: 'E2E转正员工',
      idCard: '110101199601011111',
      status: '试用期',
    });
    const empAuth = { Authorization: `Bearer ${token}` };

    // 1) 提交转正申请
    const apply = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'conversion', reason: 'E2E：试用期表现良好，申请转正' },
    });
    expect(apply.status(), '提交转正').toBe(201);
    const approval = await apply.json();
    expect(approval.type).toBe('conversion');

    // 2) 管理员审批通过
    const decide = await request.put(`/api/approvals/${approval.id}/decide`, {
      headers: auth,
      data: { status: 'approved', comment: 'E2E 通过' },
    });
    expect(decide.status(), '审批').toBe(200);

    // 3) 状态已自动变更
    const check = await request.get(`/api/users/${employeeId}`, { headers: auth });
    expect((await check.json()).status, '应转为在职').toBe('在职');

    // 清理
    await request.delete(`/api/auth/accounts/${CONV_ACCOUNT}`, { headers: auth });
    await request.delete(`/api/users/${employeeId}`, { headers: auth });
  });

  // ---------- P1-3 离职流程 ----------
  test('离职流程：申请 → 审批通过 → 状态「离职」+ 账号停用', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const { employeeId, token } = await createLinkedEmployee(request, adminToken, {
      account: RESIGN_ACCOUNT,
      name: 'E2E离职员工',
      idCard: '110101199602022222',
      status: '在职',
    });
    const empAuth = { Authorization: `Bearer ${token}` };

    // 1) 提交离职申请
    const apply = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'resign', startDate: '2026-10-15', reason: 'E2E：个人原因离职' },
    });
    expect(apply.status(), '提交离职').toBe(201);
    const approval = await apply.json();

    // 2) 审批通过
    const decide = await request.put(`/api/approvals/${approval.id}/decide`, {
      headers: auth,
      data: { status: 'approved', comment: 'E2E 通过' },
    });
    expect(decide.status()).toBe(200);

    // 3) 员工状态已置离职
    const check = await request.get(`/api/users/${employeeId}`, { headers: auth });
    expect((await check.json()).status, '应转为离职').toBe('离职');

    // 4) 账号已停用（重新登录被拒）
    const relogin = await request.post('/api/auth/login', {
      data: { username: RESIGN_ACCOUNT, password: PW_2 },
    });
    expect(relogin.status(), '停用账号登录应被拒').not.toBe(200);

    // 5) 原会话已吊销
    const meRes = await request.get('/api/auth/me', { headers: empAuth });
    expect(meRes.status(), '旧会话应失效').toBe(401);

    // 清理
    await request.delete(`/api/auth/accounts/${RESIGN_ACCOUNT}`, { headers: auth });
    await request.delete(`/api/users/${employeeId}`, { headers: auth });
  });

  // ---------- P1-4 合同续签 ----------
  test('合同续签：台账更新 + 历史留痕 + 非法参数校验', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // 创建测试员工
    const empRes = await request.post('/api/users', {
      headers: auth,
      data: {
        name: 'E2E续签员工', idCard: '110101199603033333', gender: '女', age: 29,
        phone: '13300007777', department: '研发部', status: '在职',
        joinDate: '2025-01-01', employmentType: '正式',
        contractYears: 1, contractExpiry: '2026-12-31',
      },
    });
    expect(empRes.status()).toBe(201);
    const employeeId = (await empRes.json()).id;

    // 1) 续签
    const renew = await request.post(`/api/users/${employeeId}/renew-contract`, {
      headers: auth,
      data: { contractYears: 3, contractSignDate: '2026-12-01', contractExpiry: '2029-11-30' },
    });
    expect(renew.status(), '续签').toBe(201);
    const renewal = await renew.json();
    expect(renewal.contractExpiry).toBe('2029-11-30');
    expect(renewal.prevExpiry, '应记录续签前到期日').toBe('2026-12-31');

    // 2) 台账已更新
    const check = await request.get(`/api/users/${employeeId}`, { headers: auth });
    const updated = await check.json();
    expect(updated.contractExpiry).toBe('2029-11-30');
    expect(updated.contractYears).toBe(3);

    // 3) 历史可查
    const historyRes = await request.get(`/api/users/${employeeId}/contract-renewals`, { headers: auth });
    expect(historyRes.status()).toBe(200);
    const history = await historyRes.json();
    expect(history.length).toBe(1);
    expect(history[0].contractExpiry).toBe('2029-11-30');

    // 4) 非法参数被拒（到期早于签订）
    const bad = await request.post(`/api/users/${employeeId}/renew-contract`, {
      headers: auth,
      data: { contractYears: 1, contractSignDate: '2026-12-01', contractExpiry: '2026-01-01' },
    });
    expect(bad.status(), '到期早于签订应 400').toBe(400);

    // 清理
    await request.delete(`/api/users/${employeeId}`, { headers: auth });
  });

  // ---------- P1-5 人员流动统计 ----------
  test('人员流动统计：结构完整', async ({ request }) => {
    const res = await request.get('/api/stats/workforce', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.months)).toBe(true);
    expect(data.months.length).toBe(6);
    expect(Array.isArray(data.hires)).toBe(true);
    expect(Array.isArray(data.departures)).toBe(true);
    expect(Array.isArray(data.departments)).toBe(true);
    expect(typeof data.statuses).toBe('object');
    if (data.departments.length > 0) {
      expect(typeof data.departments[0].name).toBe('string');
      expect(typeof data.departments[0].count).toBe('number');
    }
  });
});
