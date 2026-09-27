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

/**
 * 业务单纸面几何（2026-09-27 需求：整块横向居中 + 可添加多条 + 一张纸固定上下两格）。
 *
 * 量的是渲染结果，不是 CSS 文本：块宽 177.80mm 写进样式不等于落在纸面上是居中的，
 * 两格的分界线是不是正好在 A4 对折线上（对折一刀裁得开），加到三条是不是真多出第二张 ——
 * 都只有排版完才知道。
 */
const sheets = (p: Page) =>
  p.evaluate(() => {
    const papers = [...document.querySelectorAll<HTMLElement>('.ywd-page')];
    if (!papers.length) throw new Error('no .ywd-page rendered');
    return {
      pageCount: papers.length,
      papers: papers.map((paper, pi) => {
        const pr = paper.getBoundingClientRect();
        const mm = (v: number) => +(v / (pr.width / 210)).toFixed(2);
        const slotEls = [...paper.querySelectorAll<HTMLElement>('.ywd-slot')];
        return {
          no: pi + 1,
          declaredSlots: paper.dataset.slots ?? '',
          pageH_mm: mm(pr.height),
          slots: slotEls.map((slot, si) => {
            const sr = slot.getBoundingClientRect();
            const block = slot.querySelector<HTMLElement>('.ywd-block');
            const table = slot.querySelector<HTMLElement>('.ywd-table');
            const date = slot.querySelector<HTMLElement>('.ywd-date');
            if (!block || !table || !date) throw new Error(`paper ${pi} slot ${si} incomplete`);
            const br = block.getBoundingClientRect();
            const tr = table.getBoundingClientRect();
            const dr = date.getBoundingClientRect();
            return {
              blank: slot.dataset.blank === 'true',
              slotTop_mm: mm(sr.top - pr.top),
              slotBottom_mm: mm(sr.bottom - pr.top),
              blockTop_mm: mm(br.top - pr.top),
              blockBottom_mm: mm(br.bottom - pr.top),
              gapTop_mm: mm(br.top - sr.top),
              gapBottom_mm: mm(sr.bottom - br.bottom),
              leftGap_mm: mm(tr.left - pr.left),
              rightGap_mm: mm(pr.right - tr.right),
              // 原件实测：日期右边界比表格右边框往里缩 575 twips = 10.14mm
              dateInset_mm: mm(tr.right - dr.right),
              dateText: (date.textContent ?? '').trim(),
              cells: (table.textContent ?? '').replace(/\s+/gu, ''),
            };
          }),
        };
      }),
    };
  });

/** A4 对折线：297 / 2 = 148.5mm，两格的分界线必须锁在这条线上 */
const FOLD_MM = 148.5;

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

  /**
   * 业务单是「左设置 + 右 A4 预览」两列，每张纸按 1122px 高排出来。
   * 以前它没有自己的高度上限，放大时整页被撑到两屏高，左边那叠字段跟着滚走
   * （2026-09-27 反馈）。修法是预览只撑自己的框、左列自己滚。
   */
  test('业务单据：放大预览只撑自己的框，不把整页顶出去', async ({ page }) => {
    await page.goto('/business-forms', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    const group = page.getByRole('group', { name: '预览缩放' });
    await expect(group).toBeVisible();
    for (let i = 0; i < 5; i++) await group.getByRole('button', { name: '放大预览' }).click();
    await expect(group.getByText('150%')).toBeVisible();

    const m = await page.getByRole('region', { name: '业务单预览区' }).evaluate((el) => {
      const main = el.closest('main') ?? document.documentElement;
      return {
        mainScrollH: main.scrollHeight,
        mainClientH: main.clientHeight,
        boxScrollH: el.scrollHeight,
        boxClientH: el.clientHeight,
      };
    });
    // 整页不该出现滚动条（修前 150% 时是 2004px 高）
    expect(m.mainScrollH).toBeLessThanOrEqual(m.mainClientH + 1);
    // 纸面超出部分由预览框自己滚
    expect(m.boxScrollH).toBeGreaterThan(m.boxClientH);
  });

  test('业务单据：整块水平居中、两格分界线就是对折线，尾格是空白单', async ({ page }) => {
    await page.goto('/business-forms', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.getByLabel('申领人').first().fill('测试申领人');
    await page.getByLabel('部门').first().fill('测试部门甲');

    const g = await sheets(page);
    expect(g.pageCount).toBe(1);
    expect(g.papers[0].pageH_mm).toBeCloseTo(297, 0);
    expect(g.papers[0].declaredSlots).toBe('2');
    const [filled, tail] = g.papers[0].slots;
    expect(filled.blank).toBe(false);
    expect(tail.blank).toBe(true);

    for (const s of g.papers[0].slots) {
      // 横向：表格左右各留 16.10mm（纸宽 210.01 - 块宽 177.80 平分）
      expect(s.leftGap_mm).toBeCloseTo(16.1, 0);
      expect(Math.abs(s.leftGap_mm - s.rightGap_mm)).toBeLessThanOrEqual(0.3);
      // 日期跟着表格走，不是跟着页边距走
      expect(s.dateInset_mm).toBeCloseTo(10.14, 0);
      // 竖向：块在自己的格子居中，上下留白相等
      expect(Math.abs(s.gapTop_mm - s.gapBottom_mm)).toBeLessThanOrEqual(1);
      expect(s.gapTop_mm).toBeGreaterThan(1);
    }

    // 第一格底边正好是 A4 对折线，单据整体落在自己半页里 —— 对折一刀就裁得开
    expect(filled.slotBottom_mm).toBeCloseTo(FOLD_MM, 0);
    expect(filled.blockBottom_mm).toBeLessThan(FOLD_MM);
    expect(tail.slotTop_mm).toBeCloseTo(FOLD_MM, 0);
    expect(tail.blockTop_mm).toBeGreaterThan(FOLD_MM);
    expect(tail.blockBottom_mm).toBeLessThanOrEqual(297 - 8 + 0.5);

    // 内容不重复：尾格只剩骨架（栏目名在、填进去的东西一个都没有）
    expect(filled.cells).toContain('测试申领人');
    expect(filled.cells).toContain('测试部门甲');
    expect(tail.cells).toContain('需办理的业务');
    expect(tail.cells).toContain('董事长批示');
    expect(tail.cells).not.toContain('测试申领人');
    expect(tail.dateText).toBe('');
  });

  test('业务单据：添加几条就排几张纸，删除后跟着收回来', async ({ page }) => {
    await page.goto('/business-forms', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.getByLabel('申领人').first().fill('甲一號');

    // 只有一条：用上半格，下半格是空白单（不是整页居中）
    let g = await sheets(page);
    expect(g.papers[0].slots.map((s) => s.blank)).toEqual([false, true]);
    expect(g.papers[0].slots[0].slotBottom_mm).toBeCloseTo(FOLD_MM, 0);

    // 第二条：与第一条同纸，尾格不再打空白单
    await page.getByRole('button', { name: '添加一条业务单' }).click();
    await page.getByLabel('申领人').nth(1).fill('乙二號');
    g = await sheets(page);
    expect(g.pageCount).toBe(1);
    expect(g.papers[0].slots.map((s) => s.blank)).toEqual([false, false]);
    expect(g.papers[0].slots[1].cells).toContain('乙二號');
    // 两格仍然各占半页、分界线仍在折线上（内容一高一矮也不会漂）
    expect(g.papers[0].slots[0].slotBottom_mm).toBeCloseTo(FOLD_MM, 0);
    expect(g.papers[0].slots[1].slotTop_mm).toBeCloseTo(FOLD_MM, 0);
    await expect(page.getByText('共 2 条 · 1 张纸')).toBeVisible();

    // 第三条：换第二张纸，尾格补一张空白单
    await page.getByRole('button', { name: '添加一条业务单' }).click();
    await page.getByLabel('申领人').nth(2).fill('丙三號');
    g = await sheets(page);
    expect(g.pageCount).toBe(2);
    expect(g.papers[1].slots.map((s) => s.blank)).toEqual([false, true]);
    expect(g.papers[1].slots[0].cells).toContain('丙三號');
    expect(g.papers[1].slots[0].cells).not.toContain('甲一號');
    await expect(page.getByText('共 3 条 · 2 张纸')).toBeVisible();

    // 删掉一条：纸数跟着收
    await page.getByRole('button', { name: '删除第 3 条业务单' }).click();
    expect((await sheets(page)).pageCount).toBe(1);
    await expect(page.getByText('共 2 条 · 1 张纸')).toBeVisible();

    // 只剩一条时删除按钮不可用（不能把列表删空）
    await page.getByRole('button', { name: '删除第 2 条业务单' }).click();
    await expect(page.getByRole('button', { name: '删除第 1 条业务单' })).toBeDisabled();
    expect((await sheets(page)).pageCount).toBe(1);
  });

  test('业务单据：沿用新增带出类型与金额，正文没填不许打印', async ({ page }) => {
    await page.goto('/business-forms', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    await page.getByLabel('申领人').first().fill('甲一號');
    await expect(page.getByLabel('需办理的业务（正文）').first()).toContainText('甲一號');

    // 沿用新增：类型/金额/部门/日期抄过来，申领人与正文留空
    await page.getByRole('button', { name: '沿用新增' }).first().click();
    await expect(page.getByLabel('申领人').nth(1)).toHaveValue('');
    await expect(page.getByLabel('金额（元）').nth(1)).toHaveValue('501');
    await expect(page.getByLabel('需办理的业务（正文）').nth(1)).toHaveValue('');

    // 正文空着不许打印，并且说清楚是哪一条
    await page.getByRole('button', { name: /^打印/ }).click();
    await expect(page.getByText('第 2 条还没有正文')).toBeVisible({ timeout: 20000 });
    // 预览仍按两格排：这一张上是"一条内容 + 一条空正文"，没有空白单
    expect((await sheets(page)).papers[0].slots.map((s) => s.blank)).toEqual([false, false]);
  });

  test('业务单据：正文太长装不下一格时独占一张并说明原因', async ({ page }) => {
    await page.goto('/business-forms', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page
      .getByLabel('需办理的业务（正文）')
      .first()
      .fill(Array(30).fill('这是一段用于验证溢出行为的申请事由文字。').join('\n'));

    await expect(page.getByText('半页装不下')).toBeVisible({ timeout: 20000 });
    const g = await sheets(page);
    expect(g.pageCount).toBe(1);
    // 独占一张时这一张不再补空白单（补了就溢出成第二页，凭空多一张纸）
    expect(g.papers[0].declaredSlots).toBe('1');
    expect(g.papers[0].slots).toHaveLength(1);
    // 超出格子时 auto margin 归零：块从 8mm 上边距开始往下排，标题不会被推到纸外
    expect(g.papers[0].slots[0].gapTop_mm).toBeCloseTo(0, 1);
    expect(g.papers[0].slots[0].blockTop_mm).toBeCloseTo(8, 0);
    expect(g.papers[0].slots[0].leftGap_mm).toBeCloseTo(16.1, 0);
  });
});
