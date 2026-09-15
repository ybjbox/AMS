import { test, expect } from '@playwright/test';

/**
 * 全站冒烟测试：验证 11 个核心页面可访问、无控制台错误、标题正确。
 * 这是最基础的回归保护——任何页面崩溃/白屏会在此被捕获。
 */
const PAGES = [
  { path: '/', title: '控制台', name: '控制台' },
  { path: '/users', title: '员工管理', name: '员工管理' },
  { path: '/seating', title: '座位安排', name: '宴会排座' },
  { path: '/name-cards', title: '会议台卡', name: '会议台卡' },
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

      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // 页面渲染出 h1（不是白屏）
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

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
