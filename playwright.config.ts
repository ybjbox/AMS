import { defineConfig, devices } from '@playwright/test';

/**
 * AMS E2E 测试配置。
 *
 * 前置条件：开发服务器已在 http://localhost:3000 运行（dev:watch 或 preview）。
 * 运行：npx playwright test          （全部）
 *      npx playwright test --ui     （交互模式，需有显示环境）
 *
 * 注意：本环境使用系统 chromium（/usr/local/bin/chromium），不下载浏览器二进制。
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false, // 涉及同一后端数据库，串行更稳
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // 使用系统 chromium（沙箱环境无浏览器下载）
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/local/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
    },
  },

  projects: [
    // 认证 setup：登录一次，保存 storageState 供后续测试复用
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // 服务器已运行时复用（不自动启动——本环境服务器常驻）
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: true,
  //   timeout: 120 * 1000,
  // },
});
