import { acct } from '../runScoped';
import { test, expect } from '@playwright/test';
import { resolveAdminPassword } from '../adminCredentials';

/**
 * 员工门户 E2E（P0）：
 * 1. 公开认领 → 管理员批准 → 员工首登被引导改密 → 改完直接进 /my
 * 2. 员工不能进 HR 页面：直达 /users 回 /my，接口 403
 * 3. 员工提交补卡后，在 /my「我的」看到「等 HR 处理」
 *
 * 账号与档案在 beforeAll 用 admin API 创建，测试结束删除；审批单由 admin 驳回。
 */
const ADMIN_PASSWORD = resolveAdminPassword();
const USERNAME = acct('e2e-portal');
const NEW_PASSWORD = 'E2ePortal#2026a';
const EMPLOYEE_NAME = 'E2E门户员工';
const PHONE = '13300008888';

let adminToken = '';
let employeeId = '';
let tempPassword = '';
let approvalId = '';

async function adminLogin(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { username: 'admin', password: ADMIN_PASSWORD } });
  expect(res.status(), 'admin 登录').toBe(200);
  return (await res.json()).token as string;
}

async function loginUI(page: import('@playwright/test').Page, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /登录系统/ }).click();
}

test.describe.serial('员工门户', () => {
  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
    const auth = { Authorization: `Bearer ${adminToken}` };

    const empRes = await request.post('/api/users', {
      headers: auth,
      data: {
        name: EMPLOYEE_NAME,
        idCard: '110101199204055678',
        gender: '男',
        age: 32,
        phone: PHONE,
        department: '研发部',
        status: '在职',
        joinDate: '2026-01-01',
        employmentType: '正式',
      },
    });
    expect(empRes.status(), '创建测试员工').toBe(201);
    employeeId = (await empRes.json()).id;

    const claimRes = await request.post('/api/auth/claims', {
      data: {
        desiredUsername: USERNAME,
        employeeId,
        displayName: EMPLOYEE_NAME,
        phoneTail: PHONE.slice(-4),
        note: 'E2E 门户测试',
      },
    });
    expect(claimRes.status(), '提交认领').toBe(201);
    const claimId = (await claimRes.json()).id;

    const decideRes = await request.put(`/api/auth/claims/${claimId}/decide`, {
      headers: auth,
      data: { decision: 'approved' },
    });
    expect(decideRes.status(), '批准认领').toBe(200);
    tempPassword = (await decideRes.json()).tempPassword;
    expect(tempPassword, '批准后应返回一次性口令').toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (!adminToken) return;
    const auth = { Authorization: `Bearer ${adminToken}` };
    if (approvalId) {
      await request
        .put(`/api/approvals/${approvalId}/decide`, {
          headers: auth,
          data: { status: 'rejected', comment: 'E2E 清理' },
        })
        .catch(() => undefined);
    }
    await request.delete(`/api/auth/accounts/${USERNAME}`, { headers: auth });
    if (employeeId) await request.delete(`/api/users/${employeeId}`, { headers: auth });
  });

  test('认领批准后首登改密，改完直接进 /my', async ({ page }) => {
    await loginUI(page, tempPassword);
    await page.waitForURL('**/settings');
    await expect(page.getByText('首次登录，请先修改初始密码')).toBeVisible();

    await page.locator('#currentPassword').fill(tempPassword);
    await page.locator('#newPassword').fill(NEW_PASSWORD);
    await page.locator('#confirmPassword').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: '修改密码' }).click();

    await page.waitForURL('**/my', { timeout: 15000 });
    await expect(page.getByText('我的考勤').first()).toBeVisible();
    await expect(page.locator('h1').first()).toContainText(EMPLOYEE_NAME);
  });

  test('员工直达 HR 页面会回 /my，接口返回 403', async ({ page }) => {
    await loginUI(page, NEW_PASSWORD);
    await page.waitForURL('**/my');

    const token = await page.evaluate(() => localStorage.getItem('app_auth_token'));
    expect(token).toBeTruthy();
    const forbidden = await page.request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(forbidden.status(), '员工读员工列表应 403').toBe(403);

    await page.goto('/users');
    await page.waitForURL('**/my', { timeout: 10000 });
    await expect(page.getByText('我的考勤').first()).toBeVisible();
  });

  test('提交补卡后，「我的」显示等 HR 处理', async ({ page, request }) => {
    await loginUI(page, NEW_PASSWORD);
    await page.waitForURL('**/my');
    const token = await page.evaluate(() => localStorage.getItem('app_auth_token'));

    const applyRes = await request.post('/api/approvals', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        type: 'makeup',
        punchDate: '2026-09-15',
        punchTime: '09:10',
        punchKind: '上班卡',
        reason: 'E2E 门户：那天替人顶班',
      },
    });
    expect(applyRes.status(), '提交补卡').toBe(201);
    approvalId = (await applyRes.json()).id;

    await page.getByRole('button', { name: /^我的/ }).click();
    await expect(page.getByText('等 HR 处理').first()).toBeVisible();
    await expect(page.getByText('E2E 门户：那天替人顶班').first()).toBeVisible();
  });
});
