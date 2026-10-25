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
const REJECT_USERNAME = acct('e2e-reject');
const NEW_PASSWORD = 'E2ePortal#2026a';
const EMPLOYEE_NAME = 'E2E门户员工';
const PHONE = '13300008888';
const REJECT_PHONE = '13300006666';

let adminToken = '';
let employeeId = '';
let rejectedEmployeeId = '';
let tempPassword = '';
let approvalId = '';
let announcementId = '';

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

    const noticeRes = await request.post('/api/announcements', {
      headers: auth,
      data: {
        title: 'E2E 门户公告',
        content: '本周五前完成考勤确认；有异议请在「异常」里提出。',
        priority: 'important',
      },
    });
    expect(noticeRes.status(), '发布测试公告').toBe(201);
    announcementId = (await noticeRes.json()).id;
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
    if (announcementId) await request.delete(`/api/announcements/${announcementId}`, { headers: auth });
    if (employeeId) await request.delete(`/api/users/${employeeId}`, { headers: auth });
    if (rejectedEmployeeId) await request.delete(`/api/users/${rejectedEmployeeId}`, { headers: auth });
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

  test('员工在门户「公告」看到公司通知与重要标记', async ({ page }) => {
    await loginUI(page, NEW_PASSWORD);
    await page.waitForURL('**/my');

    await page.getByRole('button', { name: '公告', exact: true }).click();
    await expect(page.getByRole('heading', { name: '公告', exact: true })).toBeVisible();
    await expect(page.getByText('E2E 门户公告')).toBeVisible();
    await expect(page.getByText('本周五前完成考勤确认')).toBeVisible();
    await expect(page.getByText('重要', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileNav = page.getByRole('navigation', { name: '员工门户导航' });
    await expect(mobileNav.getByRole('button')).toHaveCount(4);
    await expect(mobileNav.getByRole('button', { name: '公告' })).toHaveAttribute('aria-current', 'page');
  });

  test('断网时保留上次结果并标注，且不再重复弹全局网络错误', async ({ page }) => {
    await loginUI(page, NEW_PASSWORD);
    await page.waitForURL('**/my');
    await expect(page.getByText('已核对', { exact: false }).first()).toBeVisible();

    // 先在线加载一次上个月，让这个月有缓存
    await page.getByRole('button', { name: '上个月' }).click();
    await expect(page.getByText('已核对', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: '下个月' }).click();

    await page.route('**/api/my/summary**', (route) => route.abort());
    await page.getByRole('button', { name: '上个月' }).click();

    await expect(page.getByText(/当前离线，显示的是上次加载的结果/)).toBeVisible();
    await expect(page.getByText('已核对', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('网络请求失败')).toHaveCount(0);
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

  test('认领进度：批准后本人可查已开通，页面给出登录入口', async ({ page, request }) => {
    const api = await request.post('/api/auth/claims/lookup', {
      data: { displayName: EMPLOYEE_NAME, phoneTail: PHONE.slice(-4) },
    });
    expect(api.status(), '查询认领进度').toBe(200);
    const body = await api.json();
    expect(body).toMatchObject({ status: 'approved', desiredUsername: USERNAME, accountOpened: true });
    expect(JSON.stringify(body), '进度接口不回显口令').not.toContain('tempPassword');

    await page.goto('/claim');
    await page.getByRole('button', { name: /查询进度/ }).click();
    await page.getByLabel('姓名').fill(EMPLOYEE_NAME);
    await page.getByLabel('手机号后 4 位').fill(PHONE.slice(-4));
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(page.getByText('账号已开通')).toBeVisible();
    await expect(page.getByRole('link', { name: '去登录' })).toBeVisible();
  });

  test('认领进度：待核对可查，驳回后能看到原因', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const empRes = await request.post('/api/users', {
      headers: auth,
      data: {
        name: 'E2E驳回员工',
        idCard: '110101199205066789',
        gender: '男',
        age: 34,
        phone: REJECT_PHONE,
        department: '研发部',
        status: '在职',
        joinDate: '2026-01-01',
        employmentType: '正式',
      },
    });
    expect(empRes.status(), '创建驳回用例员工').toBe(201);
    rejectedEmployeeId = (await empRes.json()).id;

    const claimRes = await request.post('/api/auth/claims', {
      data: {
        desiredUsername: REJECT_USERNAME,
        employeeId: rejectedEmployeeId,
        displayName: 'E2E驳回员工',
        phoneTail: REJECT_PHONE.slice(-4),
      },
    });
    expect(claimRes.status(), '提交驳回用例申请').toBe(201);
    const claimId = (await claimRes.json()).id;

    const pending = await request.post('/api/auth/claims/lookup', {
      data: { displayName: 'E2E驳回员工', phoneTail: REJECT_PHONE.slice(-4) },
    });
    expect(pending.status()).toBe(200);
    expect((await pending.json()).status).toBe('pending');

    const rejected = await request.put(`/api/auth/claims/${claimId}/decide`, {
      headers: auth,
      data: { decision: 'rejected', reason: '工号与手机尾号对不上' },
    });
    expect(rejected.status(), '驳回认领').toBe(200);

    const after = await request.post('/api/auth/claims/lookup', {
      data: { displayName: 'E2E驳回员工', phoneTail: REJECT_PHONE.slice(-4) },
    });
    expect(after.status()).toBe(200);
    expect(await after.json()).toMatchObject({
      status: 'rejected',
      rejectReason: '工号与手机尾号对不上',
    });

    const wrongTail = await request.post('/api/auth/claims/lookup', {
      data: { displayName: 'E2E驳回员工', phoneTail: '0001' },
    });
    expect(wrongTail.status(), '尾号不对不区分原因').toBe(404);
    expect((await wrongTail.json()).error).toContain('没有查到');
  });
});
