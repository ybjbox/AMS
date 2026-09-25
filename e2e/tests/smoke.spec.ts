import { test, expect } from '@playwright/test';

/**
 * 全站冒烟测试：验证 12 个核心页面可访问、无控制台错误、标题正确。
 * 这是最基础的回归保护——任何页面崩溃/白屏会在此被捕获。
 * 打印工具的三个标签都单独跑一遍：它们共用一个路由，崩溃点各自独立。
 */
const PAGES = [
  { path: '/', title: '控制台', name: '控制台' },
  { path: '/users', title: '员工管理', name: '员工管理' },
  { path: '/print-tools', title: '打印工具', name: '打印工具·宴会排座' },
  { path: '/print-tools?tab=name-cards', title: '打印工具', name: '打印工具·会议台卡' },
  { path: '/print-tools?tab=meal-vouchers', title: '打印工具', name: '打印工具·工作餐券' },
  { path: '/documents', title: '文件套件', name: '常用文件' },
  { path: '/attendance', title: '考勤管理', name: '考勤管理' },
  { path: '/contracts', title: '合同管理', name: '合同管理' },
  { path: '/departments', title: '部门管理', name: '部门管理' },
  { path: '/todos', title: '待办事项', name: '待办事项' },
  { path: '/approvals', title: '审批中心', name: '审批中心' },
  { path: '/settings', title: '系统设置', name: '系统设置' },
];

test.describe('全站页面冒烟', () => {
  for (const p of PAGES) {
    test(`${p.name} (${p.path}) 可正常加载`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
      });
      page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message.slice(0, 200)));

      // 冷启动（CI 首次 Vite 编译）较慢：给 goto 与渲染更宽容的时间
      await page.goto(p.path, { timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 60000 });

      // 页面渲染出 h1（不是白屏）
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });

      // 无横向滚动（响应式基线）
      const hasHScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      expect(hasHScroll, '不应有横向滚动').toBe(false);

      // 无控制台错误
      expect(errors, `控制台错误: ${errors.join(' | ')}`).toEqual([]);
    });
  }
});

/** 三个打印页合并为 /print-tools 的标签，旧书签必须落到对应标签而不是被弹回控制台。 */
test.describe('旧打印页路径兼容', () => {
  const LEGACY = [
    { from: '/seating', tab: 'seating', heading: '座位安排' },
    { from: '/name-cards', tab: 'name-cards', heading: '会议台卡' },
    { from: '/meal-vouchers', tab: 'meal-vouchers', heading: '工作餐券' },
  ];

  for (const l of LEGACY) {
    test(`${l.from} 跳到 ?tab=${l.tab}`, async ({ page }) => {
      await page.goto(l.from, { timeout: 60000 });
      await expect(page).toHaveURL(`/print-tools?tab=${l.tab}`);
      await expect(page.locator('h1').first()).toContainText(l.heading);
      // 标签条上当前项确实高亮在对应标签（重定向没丢 tab 参数）
      await expect(page.locator(`#print-tool-tab-${l.tab}`)).toHaveAttribute('aria-selected', 'true');
    });
  }
});
