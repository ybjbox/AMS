import { test, expect } from '@playwright/test';

/**
 * 排座的台卡入口：设置与打印合成一个入口，弹窗打开后焦点直接落在「打印」上
 * （原生 button 拿到焦点即代表回车可出纸 —— 不真按，headless 里 window.print 会挂住测试）。
 */
test.describe('排座台卡打印入口', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('只有一个入口，弹窗标题就是「打印台卡」，焦点在打印按钮上', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));

    await page.goto('/print-tools?tab=seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.getByRole('button', { name: /自动排座/ }).first().click();
    await expect(page.locator('[data-table-number]').first()).toBeVisible({ timeout: 20000 });

    // 工具栏只剩一个打印入口（原来「台卡设置」+「打印台卡」两个按钮并排）
    await expect(page.getByRole('button', { name: /^打印台卡/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /台卡设置/ })).toHaveCount(0);

    await page.getByRole('button', { name: /^打印台卡/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('打印台卡').first()).toBeVisible();
    await expect(dialog.getByText(/打印预览 \(\d+桌\)/)).toBeVisible();

    // BaseModal 会先聚焦标题栏的关闭钮，弹窗随后把焦点交给「打印」
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.textContent?.trim()), { timeout: 3000 })
      .toBe('打印');

    expect(errors).toEqual([]);
  });
});
