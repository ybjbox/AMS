import { test, expect, type Page } from '@playwright/test';

/**
 * 餐券版面回归：纸张选择必须真的落到打印产物上（@page + 预览正文宽），
 * 且留空的日期段落要印成两个中文字符宽的手写占位。
 * 这两条都是"看着对、打出来不对"的高危面，光看设置界面发现不了。
 *
 * 券面参数是按账号存的，所以每条用例都先把纸张与日期摆回母版形态，
 * 免得上一条用例留下的设置把断言带偏。
 */
const frameCss = (page: Page) =>
  page.evaluate(() => {
    const doc = (
      document.querySelector('iframe[title="餐券预览"]') as HTMLIFrameElement | null
    )!.contentDocument!;
    const style = doc.querySelector('style')!.textContent!;
    const period = doc.querySelector('.period') as HTMLElement;
    const blank = doc.querySelector('.fill') as HTMLElement;
    const sheet = doc.querySelector('.sheet') as HTMLElement;
    return {
      pageRule: /@page \{([^}]*)\}/.exec(style)?.[1] ?? '',
      sheetWidth: sheet.getBoundingClientRect().width,
      tableWidth: doc.querySelector('table')!.getBoundingClientRect().width,
      sheetCount: doc.querySelectorAll('.sheet').length,
      label: doc.defaultView!.getComputedStyle(sheet, '::before').content ?? '',
      blankMm: +(blank.getBoundingClientRect().width / 3.7795).toFixed(1),
      periodClipped: period.scrollWidth > period.clientWidth + 1,
      fillCount: doc.querySelectorAll('.period .fill').length,
    };
  });

async function pickPaper(page: Page, name: RegExp) {
  await page.getByRole('combobox', { name: '纸张' }).click();
  await page.getByRole('option', { name }).click();
  await page.waitForTimeout(700);
}

async function openVoucherTab(page: Page) {
  await page.goto('/print-tools?tab=meal-vouchers', { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await expect(page.locator('iframe[title="餐券预览"]')).toBeVisible();
  // 母版形态：只印年份、月日留空手写
  await page.getByLabel('使用时间起始月').fill('');
  await page.getByLabel('使用时间起始日').fill('');
  await page.getByLabel('使用时间截止年').fill('2026');
  await page.getByLabel('使用时间截止月').fill('');
  await page.getByLabel('使用时间截止日').fill('');
  await pickPaper(page, /A4/);
  await page.waitForTimeout(1200);
}

test.describe('工作餐券版面', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('默认 A4：一张纸一个白卡、占位是手写宽度、整行不裁切', async ({ page }) => {
    await openVoucherTab(page);
    const m = await frameCss(page);
    expect(m.pageRule).toContain('size: 210mm 297mm');
    // 预览按真纸尺寸出图：纸 210mm、内容区 = 210 − 左5 − 右4 = 201mm
    expect(m.sheetWidth).toBeCloseTo(210 * 3.7795, -1);
    expect(m.tableWidth).toBeCloseTo(201 * 3.7795, -1);
    expect(m.sheetCount).toBe(2); // 20 张 = 每页 10 张 × 2 页
    expect(m.label).toContain('预览纸张: A4 (210x297mm)');
    expect(m.fillCount).toBeGreaterThan(0);
    expect(m.blankMm).toBeGreaterThanOrEqual(4.5); // 一个中文字符 ≈ 4.6mm，且不随整行缩字变小
    expect(m.blankMm).toBeLessThan(6);
    expect(m.periodClipped).toBe(false);
    await expect(page.getByText('打印预览 (2页)')).toBeVisible();
    await expect(page.locator('aside p', { hasText: /超过券宽|放不下/ })).toHaveCount(0);
  });

  test('换 A5 后 @page、纸张尺寸与警告一起跟上，换回 A4 警告消失', async ({ page }) => {
    await openVoucherTab(page);

    await pickPaper(page, /A5/);
    const a5 = await frameCss(page);
    expect(a5.pageRule).toContain('size: 148mm 210mm');
    expect(a5.sheetWidth).toBeCloseTo(148 * 3.7795, -1);
    expect(a5.tableWidth).toBeCloseTo(139 * 3.7795, -1);
    expect(a5.label).toContain('预览纸张: A5 (148x210mm)');
    // A5 双列放不下母版那几句长文案 —— 必须如实报警，而不是闷声裁切
    await expect(page.locator('aside p', { hasText: '超过券宽' })).toBeVisible();

    await pickPaper(page, /A4/);
    const a4 = await frameCss(page);
    expect(a4.pageRule).toContain('size: 210mm 297mm');
    expect(a4.sheetCount).toBe(2);
    await expect(page.locator('aside p', { hasText: '超过券宽' })).toHaveCount(0);
  });

  test('预览缩放只改渲染比例：纸面毫米尺寸不变，且记住上次比例', async ({ page }) => {
    await openVoucherTab(page);
    const before = await frameCss(page);

    await page.getByRole('button', { name: '缩小预览' }).click();
    await expect(page.getByText('90%')).toBeVisible();
    const during = await frameCss(page);
    // iframe 内部的 CSS 尺寸不受影响 —— 缩放不会把毫米改成非整数，打印产物一个字节都没变
    expect(during.sheetWidth).toBeCloseTo(before.sheetWidth, 0);
    expect(during.tableWidth).toBeCloseTo(before.tableWidth, 0);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await expect(page.getByText('90%')).toBeVisible(); // 比例记在本机

    await page.getByRole('button', { name: '恢复 100%' }).click();
    await expect(page.getByText('100%')).toBeVisible();
    // 100 → 50 共 5 步，到下限后按钮禁用（不会出现 0% 或负数）
    for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: '缩小预览' }).click();
    await expect(page.getByText('50%')).toBeVisible();
    await expect(page.getByRole('button', { name: '缩小预览' })).toBeDisabled();
  });
});
