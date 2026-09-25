import { test, expect, type Page } from '@playwright/test';

/**
 * 「有预览的地方都有百分比加减」的回归：控件必须出现在每个按纸面排版的预览里，
 * 并且点它确实改变渲染比例（只改渲染，不改任何毫米版面 —— 餐券那条在 voucher.spec.ts 里钉）。
 */
const zoomOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return el ? getComputedStyle(el).zoom : 'missing';
  }, selector);

test.describe('预览缩放控件', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('会议台卡预览：控件在，放大后渲染比例变了', async ({ page }) => {
    await page.goto('/print-tools?tab=name-cards', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20000 });

    const group = page.getByRole('group', { name: '预览缩放' });
    await expect(group).toBeVisible();
    await expect(group.getByText('100%')).toBeVisible();

    await group.getByRole('button', { name: '放大预览' }).click();
    await expect(group.getByText('110%')).toBeVisible();
    // 台卡预览的缩放层（zoom 是渲染属性，computed 值即生效比例）
    await expect.poll(() => zoomOf(page, '[aria-label="台卡预览区"] div[style*="zoom"]')).toBe('1.1');
  });

  test('排座台卡弹窗：预览区同样带控件', async ({ page }) => {
    await page.goto('/print-tools?tab=seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.getByRole('button', { name: /自动排座/ }).first().click();
    await expect(page.locator('[data-table-number]').first()).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /^打印台卡/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const group = dialog.getByRole('group', { name: '预览缩放' });
    await expect(group).toBeVisible();
    await group.getByRole('button', { name: '缩小预览' }).click();
    await expect(group.getByText('90%')).toBeVisible();
  });
});
