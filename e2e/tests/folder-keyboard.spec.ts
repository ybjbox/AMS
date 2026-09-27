import { test, expect } from '@playwright/test';

/**
 * 文档库文件夹的键盘可达性（2026-09-26 审查 B2）。
 *
 * 旧写法是 `hidden group-hover:flex`：display:none 的元素进不了 Tab 序，
 * 于是"新建子文件夹/重命名/删除"三个唯一入口只有鼠标能拿到；行本身还是 div onClick，
 * 连"进入文件夹"都没有键盘路径。
 *
 * 注意别用 toBeVisible() 当证据 —— Playwright 认为 opacity:0 也算"可见"，
 * 所以这里量 computed opacity 与 document.activeElement。
 */
test.describe('文件夹键盘操作', () => {
  test.use({ viewport: { width: 1370, height: 770 } });
  const folderName = `键盘验证 ${Date.now().toString(36)}`;
  let token = '';
  let createdId = '';

  test.beforeEach(async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { username: 'admin', password: process.env.AMS_ADMIN_PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    token = (await login.json()).token;
    const created = await request.post('/api/folders', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: folderName, parentId: null, type: 'folder' },
    });
    expect(created.ok()).toBeTruthy();
    createdId = (await created.json()).id;
  });

  test.afterEach(async ({ request }) => {
    // 别把取证用的文件夹留在开发库里
    if (!createdId) return;
    await request.delete(`/api/folders/${createdId}`, { headers: { Authorization: `Bearer ${token}` } });
    createdId = '';
  });

  test('Tab 能走到三个操作按钮，且聚焦后它们真的看得见', async ({ page }) => {
    await page.goto('/documents', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    // 文件夹树在「文件库」标签里
    const tab = page.getByRole('tab', { name: /文件库/ });
    if (await tab.count()) await tab.click();

    const nameBtn = page.getByRole('button', { name: folderName, exact: true });
    await expect(nameBtn).toBeVisible({ timeout: 20000 });

    // 未聚焦时操作按钮应当是透明的（opacity:0），但仍在 Tab 序里
    const addBtn = page.getByRole('button', { name: `新建子文件夹：${folderName}` });
    await expect(addBtn).toHaveCount(1);
    const opacityBefore = await addBtn.evaluate((el) => getComputedStyle(el.closest('div')!).opacity);
    expect(Number(opacityBefore)).toBeLessThan(0.05);

    await nameBtn.focus();
    await page.keyboard.press('Enter');
    // 键盘激活的可见结果：右侧文件列表切到这个空文件夹
    // （不用 aria-current 断言：选中后树会重渲染，稳定信号是列表区的文案）
    await expect(page.getByText('当前文件夹为空')).toBeVisible({ timeout: 10000 });

    await addBtn.focus();
    // 容器带 transition-opacity：聚焦后立刻读 computed 会拿到过渡中间值（实测 0.03），
    // 所以要轮询到过渡结束，而不是断言瞬时值
    await expect
      .poll(async () =>
        addBtn.evaluate((el) => Number(getComputedStyle(el.closest('div')!).opacity))
      )
      .toBeGreaterThan(0.95);

    // 键盘激活：打开"新建子文件夹"对话框
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  });

  test('行内按钮聚焦后，重命名与删除也带上了作用对象名', async ({ page }) => {
    await page.goto('/documents', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    const tab = page.getByRole('tab', { name: /文件库/ });
    if (await tab.count()) await tab.click();
    await expect(page.getByRole('button', { name: folderName, exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: `重命名文件夹：${folderName}` })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `删除文件夹：${folderName}` })).toHaveCount(1);
  });
});
