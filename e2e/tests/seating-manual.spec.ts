import { test, expect } from '@playwright/test';

/**
 * 手动排座 E2E：换桌、桌内换序、移出到未入座、点选移回。
 *
 * 拖拽这一步用 page.dispatchEvent 在真实元素上派发 dragstart/dragover/drop（带一个真的
 * DataTransfer），走的是组件里同一套 dataTransfer 读写代码；Playwright 的原生
 * page.dragAndDrop 在 Chromium 下会把 dragstart 落到别的元素上（实测 dragstart 的
 * data-member-id 与给定源不符），不适合当回归依据。
 * 「点选 → 移入此桌」与「移出」是完整的真实点击路径。
 *
 * 只在内存里改画布，不保存方案，跑完不需要清理数据；目标桌固定选最后一桌（唯一没坐满的）。
 */
const dragBetween = (page: import('@playwright/test').Page, sourceId: string, targetSelector: string, beforeId: string | null = null) =>
  page.evaluate(
    ({ sourceId, targetSelector, beforeId }) => {
      const source = document.querySelector(`[data-member-id="${sourceId}"]`) as HTMLElement | null;
      const target = (beforeId
        ? document.querySelector(`[data-member-id="${beforeId}"]`)
        : document.querySelector(targetSelector)) as HTMLElement | null;
      if (!source || !target) throw new Error(`找不到拖拽端点 source=${!!source} target=${!!target}`);
      const dt = new DataTransfer();
      const fire = (el: HTMLElement, type: string) => {
        el.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt })
        );
      };
      fire(source, 'dragstart');
      fire(target, 'dragover');
      fire(target, 'drop');
      fire(source, 'dragend');
    },
    { sourceId, targetSelector, beforeId }
  );

test.describe('座位手动微调', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('拖到另一桌 → 桌内换序 → 移出到未入座 → 点选移回桌内', async ({ page }) => {
    await page.goto('/seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    await page.getByRole('button', { name: /自动排座/ }).first().click();
    const cards = page.locator('[data-table-number]');
    await expect(cards.first()).toBeVisible({ timeout: 20000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    const from = (await cards.first().getAttribute('data-table-number'))!;
    const to = (await cards.last().getAttribute('data-table-number'))!;
    const chip = cards.first().locator('[data-member-id]').first();
    const memberId = (await chip.getAttribute('data-member-id'))!;
    // 名字从 aria-label 里取（chip 的 innerText 首行是空的座次容器）
    const memberName = /^\d+ 号 (.+?)，/.exec((await chip.getAttribute('aria-label')) ?? '')?.[1] ?? '';
    expect(memberName).toBeTruthy();
    const targetSel = `[data-table-number="${to}"]`;

    // 1) 拖到另一桌：桌尾落座 + 提示（先等提示，避免 toast 4 秒后消失造成竞态）
    await dragBetween(page, memberId, targetSel);
    await expect(page.getByText(new RegExp(`已把 ${memberName} 移到 ${to} 号桌`))).toBeVisible();
    await expect(page.locator(`${targetSel} [data-member-id="${memberId}"]`)).toBeVisible();
    await expect(page.locator(`[data-table-number="${from}"] [data-member-id="${memberId}"]`)).toHaveCount(0);

    // 2) 桌内换序：把该桌第 2 个人拖到刚移过来的人前面（换序后座次序号随之变）
    const ordered = page.locator(`${targetSel} [data-member-id]`);
    const idsBefore = await ordered.evaluateAll((els) => els.map((e) => e.getAttribute('data-member-id')));
    const movedId = idsBefore[1]!;
    const movedName = /^\d+ 号 (.+?)，/.exec((await ordered.nth(1).getAttribute('aria-label')) ?? '')?.[1] ?? '';
    await dragBetween(page, movedId, targetSel, memberId);
    await expect(page.getByText(new RegExp(`已调整 ${movedName} 在 ${to} 号桌的座次`))).toBeVisible();

    const idsAfter = await ordered.evaluateAll((els) => els.map((e) => e.getAttribute('data-member-id')));
    const expected = idsBefore.filter((id) => id !== movedId);
    expected.splice(expected.indexOf(memberId), 0, movedId);
    expect(idsAfter).toEqual(expected);
    // 换序的直接结果：moved 现在坐在被拖到的那个人前面，打印序号也小一位
    expect(idsAfter.indexOf(movedId)).toBe(idsAfter.indexOf(memberId) - 1);

    // 3) 移出座位 → 出现在未入座条
    await page.getByRole('button', { name: `把 ${memberName} 移出座位` }).click();
    const strip = page.getByTestId('unseated-strip');
    await expect(strip).toContainText(memberName);
    await expect(page.locator(`${targetSel} [data-member-id="${memberId}"]`)).toHaveCount(0);

    // 4) 真实点击路径：点选未入座的人 → 目标桌出现「移入此桌」→ 点它
    await strip.getByRole('button', { name: memberName, exact: true }).click();
    const moveIn = page.getByRole('button', { name: `把已选中的人移入 ${to} 号桌` });
    await expect(moveIn).toBeVisible();
    await moveIn.click();
    await expect(page.locator(`${targetSel} [data-member-id="${memberId}"]`)).toBeVisible();
    await expect(strip).not.toBeVisible();

    // 5) 移回来落座桌尾，屏幕上的座次号 = 该桌人数（打印序号取的就是这个下标）
    const count = await ordered.count();
    await expect(ordered.nth(count - 1)).toHaveAttribute('data-member-id', memberId);
    await expect(ordered.nth(count - 1)).toHaveAttribute('aria-label', new RegExp(`^${count} 号 `));

    // 6) 容量保护：满桌不收人，原座不动（1 号桌此时已空出一位，改挑任意一张 10/10 的桌）
    const fullCard = page.locator('[data-table-number]').filter({ hasText: /10 \/ 10 人/ }).first();
    await expect(fullCard).toBeVisible();
    const fullTable = (await fullCard.getAttribute('data-table-number'))!;
    await dragBetween(page, memberId, `[data-table-number="${fullTable}"]`);
    await expect(page.getByText('目标桌已满')).toBeVisible();
    await expect(page.locator(`${targetSel} [data-member-id="${memberId}"]`)).toBeVisible();
  });

  test('落点提示 → 删桌可撤销 → 桌号可改名（含撞号被拒）', async ({ page }) => {
    await page.goto('/seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.getByRole('button', { name: /自动排座/ }).first().click();
    const cards = page.locator('[data-table-number]');
    await expect(cards.first()).toBeVisible({ timeout: 20000 });

    const numbers = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-table-number')));
    expect(numbers.length).toBeGreaterThanOrEqual(3);
    const [firstNumber, secondNumber] = numbers as string[];
    const lastNumber = numbers[numbers.length - 1]!;

    // 1) 落点提示：悬停桌面 → 桌尾占位；悬停某个成员 → 只有他上方出现插入线
    await page.evaluate((n) => {
      document
        .querySelector(`[data-table-number="${n}"]`)
        ?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    }, firstNumber!);
    await expect(page.locator(`[data-table-number="${firstNumber}"] [data-drop-tail]`)).toBeVisible();

    const chipId = (await page.locator(`[data-table-number="${firstNumber}"] [data-member-id]`).first().getAttribute('data-member-id'))!;
    await page.evaluate((id) => {
      document
        .querySelector(`[data-member-id="${id}"]`)
        ?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    }, chipId);
    await expect(page.locator(`[data-member-id="${chipId}"]`)).toHaveClass(/before:bg-brand-500/);
    await expect(page.locator(`[data-table-number="${firstNumber}"] [data-drop-tail]`)).toHaveCount(0);

    // 2) 删掉最后一桌 → 用 toast 里的「撤销」放回原位
    await page.getByRole('button', { name: `删除 ${lastNumber} 号桌` }).click();
    await expect(page.locator(`[data-table-number="${lastNumber}"]`)).toHaveCount(0);
    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.locator(`[data-table-number="${lastNumber}"]`)).toBeVisible();
    const afterUndo = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-table-number')));
    expect(afterUndo).toEqual(numbers);

    // 3) 改桌号：标题与「各桌人数设置」里的容量行一起跟着改
    await page.getByRole('button', { name: `修改 ${firstNumber} 号桌的桌号` }).click();
    const numberInput = page.getByRole('spinbutton', { name: '新桌号' });
    await expect(numberInput).toBeVisible();
    // 编辑态不能把卡片撑出横向滚动
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)).toBe(false);
    await numberInput.fill('88');
    await numberInput.press('Enter');
    await expect(page.locator('[data-table-number="88"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: '88号桌' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: '第 88 桌人数' })).toBeVisible();
    await expect(page.getByText(new RegExp(`${firstNumber} 号桌已改为 88 号桌`))).toBeVisible();

    // 4) 撞号被拒：88 号桌改成还存在的第二桌号，弹提示且画布不变
    await page.getByRole('button', { name: '修改 88 号桌的桌号' }).click();
    await page.getByRole('spinbutton', { name: '新桌号' }).fill(secondNumber!);
    await page.getByRole('spinbutton', { name: '新桌号' }).press('Enter');
    await expect(page.getByText('已经有这个桌号了，换一个')).toBeVisible();
    await expect(page.locator('[data-table-number="88"]')).toBeVisible();
  });
});
