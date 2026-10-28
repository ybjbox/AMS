import { test, expect } from '@playwright/test';

/**
 * 运营闭环回归（2026-10-28 设计链落地）：
 * - 通知中心能从页眉进入，并按 refKey 落到合同；
 * - 控制台把“数据截止 / 未导入”说清楚；
 * - 待办合同提醒可直接续签，手动待办可批量完成；
 * - 未关联员工档案的账号提交审批前就被阻断。
 */

async function adminToken(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { username: 'admin', password: process.env.AMS_ADMIN_PASSWORD },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).token as string;
}

test.describe('运营闭环：通知 / 数据 / 待办 / 账号', () => {
  test('通知中心可打开，并把合同通知落到合同页', async ({ page, request }) => {
    const token = await adminToken(request);
    const created = await request.post('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: 'E2E 合同通知',
        message: '员工 E2E · 合同将于明天到期',
        type: 'warning',
        refKey: 'contract:EMP9999',
      },
    });
    expect(created.status()).toBe(201);
    const notification = await created.json();

    try {
      await page.goto('/');
      await page.getByRole('button', { name: /通知/ }).first().click();
      await page.getByRole('button', { name: '查看全部通知' }).click();
      await expect(page).toHaveURL(/\/notifications$/);
      await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible();

      const row = page.getByRole('button', { name: /E2E 合同通知/ });
      await expect(row).toBeVisible();
      await row.click();
      await expect(page).toHaveURL(/\/contracts\?q=EMP9999/);
    } finally {
      await request.delete(`/api/notifications/${notification.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test('控制台把数据截止说清楚', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/数据截止 \d{4}-\d{2}-\d{2}|尚未导入打卡/).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('合同待办可直接续签，手动待办可批量完成', async ({ page, request }) => {
    const token = await adminToken(request);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const employee = await (
      await request.post('/api/users', {
        headers,
        data: {
          name: 'E2E 续签员工',
          idCard: '110101199001019999',
          gender: '男',
          age: 30,
          phone: '13300000009',
          department: '研发部',
          status: '在职',
          joinDate: '2026-01-01',
          employmentType: '全职',
        },
      })
    ).json();
    expect(employee.id).toBeTruthy();

    const contractTodo = await (
      await request.post('/api/todos', {
        headers,
        data: { title: 'E2E 合同续签入口', type: 'contract', targetId: employee.id, dueDate: '2026-12-31' },
      })
    ).json();
    const manualTodo = await (
      await request.post('/api/todos', {
        headers,
        data: { title: 'E2E 批量完成', type: 'manual', dueDate: '2026-12-31' },
      })
    ).json();

    try {
      await page.goto('/todos');
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });

      const contractRow = page.locator('div.group').filter({ hasText: 'E2E 合同续签入口' }).first();
      await contractRow.scrollIntoViewIfNeeded();
      await contractRow.getByRole('button', { name: '续签', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('合同续签');
      await page.keyboard.press('Escape');

      await contractRow.getByRole('button', { name: '说明', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('暂不续签说明');
      await page.getByPlaceholder(/例如：员工已离职/).fill('E2E 暂不续签说明');
      await page.getByRole('button', { name: '记录说明并关闭' }).click();
      await expect(page.getByText('已记录暂不续签说明')).toBeVisible();

      const manualRow = page.locator('div.group').filter({ hasText: 'E2E 批量完成' }).first();
      await manualRow.scrollIntoViewIfNeeded();
      await manualRow.getByRole('checkbox', { name: /选择待办：E2E 批量完成/ }).check();
      await page.getByRole('button', { name: '批量完成', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('完成 1 条待办');
      await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click();
      await expect(page.getByText('已完成 1 条待办')).toBeVisible();
    } finally {
      await request.delete(`/api/todos/${contractTodo.id}`, { headers });
      await request.delete(`/api/todos/${manualTodo.id}`, { headers });
      await request.delete(`/api/users/${employee.id}`, { headers });
    }
  });

  test('未关联员工档案时审批提交前被阻断', async ({ page, request }) => {
    await page.goto('/approvals');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('当前账号未关联员工档案，无法提交审批。')).toBeVisible();
    const submit = page.getByRole('button', { name: /账号未关联员工档案/ });
    await expect(submit).toBeDisabled();

    const token = await adminToken(request);
    const res = await request.post('/api/approvals', {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'leave', leaveType: '事假', startDate: '2026-12-01', reason: 'E2E 未关联阻断' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('EMPLOYEE_NOT_LINKED');
  });
});
