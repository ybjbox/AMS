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

/**
 * 顶栏几何：条子必须铺满预览面板的左右两边，且不能压住正文第一行。
 *
 * 这里量的是渲染结果而不是类名 —— 条子原先用 `-mt-6 -ml-6 + w-[calc(100%+1.5rem)]` 做出血，
 * 但 sticky 的钳位线在滚动容器内容盒上沿，负 top margin 会被压回原处而流内仍按负 margin 预留，
 * 于是条子盖住「预览纸张: A4…」那一行；水平方向又因父级 items-center 居中而左右各偏 16px。
 * 两个都是只有真渲染才看得出来的问题。
 */
const barGeometry = (page: Page, groupSelector: string) =>
  page.evaluate((sel) => {
    const group = document.querySelector(sel);
    const bar = group?.closest('.sticky') as HTMLElement | null;
    const region = bar?.parentElement as HTMLElement | null;
    const firstText = bar?.nextElementSibling?.querySelector('div') as HTMLElement | null;
    if (!bar || !region) throw new Error('no sticky bar for ' + sel);
    if (!firstText) throw new Error('no content under the sticky bar for ' + sel);
    const br = bar.getBoundingClientRect();
    const rr = region.getBoundingClientRect();
    const fr = firstText.getBoundingClientRect();
    return {
      leftGap: +(br.left - rr.left).toFixed(1),
      rightGap: +(rr.right - br.right).toFixed(1),
      /** > 0 表示条子把正文首行压掉这么多像素 */
      coversFirstText: +(br.bottom - fr.top).toFixed(1),
    };
  }, groupSelector);

test.describe('预览缩放控件', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('顶栏铺满预览面板且不压住正文首行（台卡 / 排座）', async ({ page }) => {
    await page.goto('/print-tools?tab=name-cards', { timeout: 60000 });
    await page.waitForSelector('[aria-label="台卡预览区"] [aria-label="预览缩放"]', { timeout: 20000 });
    const cards = await barGeometry(page, '[aria-label="台卡预览区"] [aria-label="预览缩放"]');
    expect(Math.abs(cards.leftGap)).toBeLessThanOrEqual(1);
    expect(Math.abs(cards.rightGap)).toBeLessThanOrEqual(1);
    expect(cards.coversFirstText).toBeLessThan(0);

    await page.goto('/print-tools?tab=seating', { timeout: 60000 });
    await page.getByRole('button', { name: /自动排座/ }).first().click();
    await expect(page.locator('[data-table-number]').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /^打印台卡/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const seat = await barGeometry(page, '[role="dialog"] [aria-label="预览缩放"]');
    expect(Math.abs(seat.leftGap)).toBeLessThanOrEqual(1);
    expect(Math.abs(seat.rightGap)).toBeLessThanOrEqual(1);
    expect(seat.coversFirstText).toBeLessThan(0);
  });

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
