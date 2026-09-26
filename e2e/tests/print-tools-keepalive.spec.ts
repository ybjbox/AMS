import { test, expect, type Page } from '@playwright/test';

/**
 * 排座画布是内存态（保存方案之前没有任何落盘点），所以「切个标签再切回来」
 * 一旦重挂载就等于把用户排好的位置清空 —— 这条按真实组件量画布，不测替身。
 */
const canvas = (page: Page) => page.locator('[data-table-number]');
const signature = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-table-number]')]
      .map((c) => `${c.getAttribute('data-table-number')}=${(c.textContent || '').replace(/\s+/g, '')}`)
      .join('|')
  );

test.describe('打印工具标签切换不丢排座', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('排好座后切到会议台卡再切回来，画布原样还在', async ({ page }) => {
    await page.goto('/print-tools?tab=seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.getByRole('button', { name: /自动排座/ }).first().click();
    await expect(canvas(page).first()).toBeVisible({ timeout: 20000 });
    const before = await signature(page);
    expect(before.length).toBeGreaterThan(0);

    await page.getByRole('tab', { name: /会议台卡/ }).click();
    await expect(page.locator('#print-tool-panel-name-cards')).toBeVisible();
    await expect(page.locator('#print-tool-panel-seating')).toBeHidden();

    await page.getByRole('tab', { name: /宴会排座/ }).click();
    await expect(canvas(page).first()).toBeVisible({ timeout: 20000 });
    expect(await signature(page)).toBe(before);
    // 画布在，打印入口才该能用（此前切回来是 0 桌 + 按钮禁用）
    await expect(page.getByRole('button', { name: /^打印台卡/ })).toBeEnabled();
  });

  test('未访问过的标签不提前挂载，访问过的只隐藏', async ({ page }) => {
    await page.goto('/print-tools?tab=seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await expect(page.locator('#print-tool-panel-meal-vouchers')).toHaveCount(0);

    await page.getByRole('tab', { name: /工作餐券/ }).click();
    await expect(page.locator('#print-tool-panel-meal-vouchers')).toBeVisible();
    await expect(page.locator('#print-tool-panel-seating')).toHaveCount(1);

    await page.getByRole('tab', { name: /宴会排座/ }).click();
    await expect(page.locator('#print-tool-panel-seating')).toBeVisible();
    await expect(page.locator('#print-tool-panel-meal-vouchers')).toBeHidden();
  });
});
