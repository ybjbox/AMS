import { test, expect } from '@playwright/test';

/**
 * 参会员工选择（批次 2）：「取消到最后一个」不该把全员重新全选。
 *
 * 原来那句判据是 `selectedUserIds.size === 0`，本意是「首次进来默认全选」，
 * 实际效果是逐个取消到最后一个的瞬间命中条件 → 整张名册被重新全选，
 * 包括刚刚被明确排除的部门。排座/台卡是要出纸的，错一次就是一叠废卡。
 * 现在只在名单本身变化时播种一次。
 */
test.describe('排座参会人选', () => {
  test.use({ viewport: { width: 1370, height: 770 } });

  test('逐个取消部门后，选择数为 0 并且停在 0', async ({ page }) => {
    await page.goto('/print-tools?tab=seating', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    const participantButton = page.getByRole('button', { name: /选择人员/ });
    await expect(participantButton).toBeVisible({ timeout: 20000 });
    const countOf = async () =>
      Number(/\((\d+)\)/.exec((await participantButton.innerText()) ?? '')?.[1] ?? -1);
    const seeded = await countOf();
    expect(seeded).toBeGreaterThan(0);

    await participantButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const deptHeaders = dialog.locator('div.cursor-pointer');
    const groups = await deptHeaders.count();
    expect(groups).toBeGreaterThan(1);

    // 每个部门点一次（进弹窗时它们都是全选状态）→ 最后一下把选择清零
    for (let i = 0; i < groups; i += 1) {
      await deptHeaders.nth(i).click({ position: { x: 24, y: 12 } });
    }

    await dialog.getByRole('button', { name: '完成' }).click();
    await expect(participantButton).toBeVisible();
    expect(await countOf()).toBe(0);

    // 再等一次渲染：修复前的那句 effect 会在这里把人全部塞回来
    await page.waitForTimeout(600);
    expect(await countOf()).toBe(0);
  });
});
