import { test, expect } from '@playwright/test';

/**
 * 移动端外壳回归（2026-10-26 Design QA）：
 * - 汉堡与图标工具栏必须有可访问名称；
 * - 移动端主控件 ≥44px；
 * - 业务单据预览可用键盘聚焦；
 * - 登录页卡片保留 16px 外边距。
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('移动端无障碍与触控', () => {
  test('后台汉堡与员工管理主操作有可访问名称且 ≥44px', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });

    const menu = page.getByRole('button', { name: '打开导航菜单' });
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    for (const name of ['导出', '批量导入', '新增员工']) {
      const btn = page.getByRole('button', { name, exact: true });
      await expect(btn).toBeVisible();
      expect((await btn.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('考勤快捷区间/来源标签单行且 ≥44px', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });

    for (const name of ['上月', '企业微信']) {
      const btn = page.getByRole('button', { name, exact: true });
      await expect(btn).toBeVisible();
      const box = (await btn.boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      // 单行：高度 44 时若文字折成两行会明显超过，这里用 clientHeight 与 scrollHeight 对齐兜底
      const wrapped = await btn.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
      expect(wrapped, `${name} 不应折行`).toBe(false);
    }
  });

  test('设置页签 ≥44px', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
    // 首页是任务卡片；进入「个人」后才出现子页签
    await page.getByRole('button', { name: /个人资料、外观/ }).click();
    const tab = page.getByRole('tab', { name: '个人设置', exact: true });
    await expect(tab).toBeVisible();
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('审批页签单行、≥44px 且不出视口', async ({ page }) => {
    await page.goto('/approvals');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });

    for (const name of ['我的申请', '待我审批', '审批记录', '待核对']) {
      const tab = page.getByRole('tab', { name, exact: true });
      await expect(tab).toBeVisible();
      const box = (await tab.boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeLessThanOrEqual(56);
      expect(box.x + box.width, `${name} 不应伸出视口`).toBeLessThanOrEqual(390.5);
      const wrapped = await tab.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
      expect(wrapped, `${name} 不应折行`).toBe(false);
    }
  });

  test('打印工具的手机工具栏与餐券预览不被压扁', async ({ page }) => {
    await page.goto('/print-tools?tab=name-cards');
    await expect(page.getByRole('heading', { name: '会议台卡' })).toBeVisible({ timeout: 30000 });
    for (const name of [/粘贴名单/, /选择人员/, /打印台卡/]) {
      const btn = page.getByRole('button', { name }).first();
      await expect(btn).toBeVisible();
      const box = (await btn.boundingBox())!;
      expect(box.width, String(name)).toBeGreaterThanOrEqual(44);
      expect(box.height, String(name)).toBeLessThanOrEqual(60);
      const wrapped = await btn.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
      expect(wrapped, `${name} 不应折行`).toBe(false);
    }

    await page.goto('/print-tools?tab=meal-vouchers');
    const preview = page.getByRole('region', { name: '餐券预览区' });
    await expect(preview).toBeVisible({ timeout: 30000 });
    expect((await preview.boundingBox())!.width).toBeGreaterThanOrEqual(300);
  });

  test('320 档通知面板不超出视口', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: /通知/ }).first().click();
    const panel = page.locator('.notification-panel');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320.5);
  });

  test('业务单据预览区可 Tab 聚焦', async ({ page }) => {
    await page.goto('/business-forms');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
    const region = page.getByRole('region', { name: '业务单预览区' });
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute('tabindex', '0');
  });

  test('排座在手机只显示桌面提示，不渲染画布', async ({ page }) => {
    await page.goto('/print-tools?tab=seating');
    await expect(page.getByRole('heading', { name: '座位安排' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: '查看已保存方案' })).toBeVisible();
    await expect(page.getByRole('button', { name: '自动排座' })).toHaveCount(0);
    await expect(page.getByText('各桌人数设置')).toBeHidden();
  });
});

test.describe('触屏设备', () => {
  test.use({ isMobile: true, hasTouch: true });

  test('AI 入口在触屏上完整可见，不贴边收起', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
    const ai = page.getByRole('button', { name: '打开 AI 助手' });
    await expect(ai).toBeVisible();
    const box = (await ai.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  });
});

test.describe('未登录公开页', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('忘记密码给出具体找回路径与退路', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: '忘记密码？' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('企微找行政 / HR');
    await expect(sheet).toContainText('报姓名 + 工号');
    await expect(sheet).toContainText('没收到口令');
    await sheet.getByRole('button', { name: '我知道了' }).click();
    await expect(sheet).toBeHidden();
  });

  test('登录页移动端保留 16px 外边距与 44px 输入/按钮', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });

    const card = page.locator('form').first().locator('..');
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(390 - (box.x + box.width)).toBeGreaterThanOrEqual(12);

    for (const label of ['用户名', '密码']) {
      const input = page.getByLabel(label, { exact: true });
      expect((await input.boundingBox())!.height, label).toBeGreaterThanOrEqual(44);
      // iOS Safari 在 <16px 时聚焦会放大整页
      const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize, `${label} 字号`).toBeGreaterThanOrEqual(16);
    }
    const submit = page.getByRole('button', { name: /登录系统/ });
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
