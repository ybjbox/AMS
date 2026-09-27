import { test, expect } from '@playwright/test';

/**
 * 员工表的键盘路径（2026-09-26 审查 B2 同类）：
 * 表头排序原来是 `<div onClick>`、整行打开档案也是 `tr onClick`，键盘都拿不到。
 */
test.describe('员工表键盘操作', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('表头排序控件是可聚焦的按钮，Enter 会在升/降之间切换顺序', async ({ page }) => {
    await page.goto('/users', { timeout: 60000 });
    await page.waitForSelector('tr[data-index="0"]', { timeout: 20000 });

    const nameHeader = page.getByRole('columnheader').first().getByRole('button');
    await expect(nameHeader).toHaveCount(1);

    // 默认顺序可能就是升序，所以比"升 / 降"两个状态，而不是比"点之前 / 点之后"
    await nameHeader.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const asc = await page.locator('tr[data-index="0"] td').first().innerText();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const desc = await page.locator('tr[data-index="0"] td').first().innerText();
    expect(desc).not.toBe(asc);
  });

  test('Tab 到某一行后按 Enter 能打开该员工的档案', async ({ page }) => {
    await page.goto('/users', { timeout: 60000 });
    await page.waitForSelector('tr[data-index="0"]', { timeout: 20000 });

    const row = page.locator('tr[data-index="0"]');
    await expect(row).toHaveAttribute('tabindex', '0');
    await row.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('员工').first()).toBeVisible();
  });
});
