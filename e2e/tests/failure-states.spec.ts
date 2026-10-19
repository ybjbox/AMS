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

  // 下面五个是 2026-09-26 审查里剩下的三个视图（考勤 / 待办 / 审批），2026-10-19 补做。
  // 考勤占三个标签，各自的空态文案不一样，所以逐个钉。

  test('考勤·打卡记录：拉取失败不说"还没有打卡记录"，也不把工作流条的"去导入"递上来', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/attendance', { timeout: 60000 });
    await expect(page.getByText('打卡记录加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /重试/ }).first()).toBeVisible();
    await expect(page.getByText('还没有打卡记录')).toHaveCount(0);
    // 列表为空是"没拉到"的结果，不是"你还没导入"。这条提示会把人支去重导一遍数据。
    await expect(page.getByText('需要先配置部门时段，否则导入的记录无法对班判定。')).toHaveCount(0);
  });

  test('考勤·异常分析：拉取失败不说"还没有进行过异常分析"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/attendance?tab=anomalies', { timeout: 60000 });
    await expect(page.getByText('异常清单加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('还没有进行过异常分析')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /一键分析异常/ })).toHaveCount(0);
  });

  test('考勤·月度报表：月报端点挂了不说"某月暂无打卡数据"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/attendance?tab=monthly', { timeout: 60000 });
    await expect(page.getByText('月度汇总加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/暂无打卡数据/)).toHaveCount(0);
    await expect(page.getByText('需要先导入打卡记录，月度报表才有数据来源。')).toHaveCount(0);
  });

  test('待办：拉取失败不说"暂无待办事项"，也不递上"立即创建"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/todos', { timeout: 60000 });
    await expect(page.getByText('待办清单加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('暂无待办事项')).toHaveCount(0);
    await expect(page.getByText('点击右上角按钮添加您的第一个任务')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /立即创建/ })).toHaveCount(0);
  });

  test('审批：拉取失败不说"暂无申请记录"', async ({ page }) => {
    await failNonAuthApi(page);
    await page.goto('/approvals', { timeout: 60000 });
    await expect(page.getByText('我的申请加载失败')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('暂无申请记录')).toHaveCount(0);
    await expect(page.getByText('在左侧提交你的第一条申请')).toHaveCount(0);
  });
});
