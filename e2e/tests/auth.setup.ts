import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 认证 Setup：登录一次并保存会话状态（storageState），
 * 供所有业务测试复用（避免每测试重复登录 + 触发防爆破限流）。
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../.auth/user.json');

setup('登录并保存会话', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // 填写凭据（调试环境的固定账号）
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input').nth(1).fill(process.env.AMS_PASSWORD || 'Ams-Debug#2026');
  await page.locator('button[type="submit"]').first().click();

  // 等待跳转到控制台（登录成功的标志）
  await page.waitForURL('**/', { timeout: 20000 });
  await expect(page.locator('h1')).toContainText('控制台', { timeout: 10000 });

  // 保存登录态
  await page.context().storageState({ path: authFile });
});
