import { test, expect } from '@playwright/test';

/**
 * 后端不可用时的界面口径（2026-09-26 审查 M1）：
 * 「加载失败」不能长得像「你没有数据，去创建」——toast 四秒就消失，留在屏幕上的空态才是用户据以行动的东西。
 *
 * 做法：把非鉴权接口全部打成 500（登录链路保留，否则测的是跳转登录而不是失败态）。
 */
const failNonAuthApi = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/') || url.includes('/api/health')) return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '服务器内部错误' }),
    });
  });
};

test.describe('后端失败时的界面', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('员工管理：显示加载失败与重试，不再说"未找到员工"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/users', { timeout: 60000 });
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('员工名单加载失败')).toBeVisible();
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible();
    await expect(page.getByText('未找到员工')).toHaveCount(0);
    await expect(page.getByText('请尝试调整搜索条件或添加新员工')).toHaveCount(0);
  });

  test('部门管理：显示加载失败，且不递上"立即创建"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/departments', { timeout: 60000 });
    await expect(page.getByText('组织架构加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('开始添加您的第一个公司部门吧')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /立即创建/ })).toHaveCount(0);
  });

  test('合同管理：名单没拉到时不说"没有符合条件的记录"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/contracts', { timeout: 60000 });
    await expect(page.getByText('员工名单加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('没有找到符合条件的员工记录')).toHaveCount(0);
  });
});
