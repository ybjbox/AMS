import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

/**
 * AMS E2E 测试配置（双模式）。
 *
 * 本地（云沙箱）：系统 chromium（/usr/local/bin/chromium），服务器常驻复用。
 * CI（GitHub Actions）：`npx playwright install chromium` 下载浏览器，webServer 自动拉起。
 *
 * 运行：npm run test:e2e            （全部）
 *      npm run test:e2e:smoke      （快速回归）
 */
const isCI = !!process.env.CI;
const localChromium = process.env.CHROMIUM_PATH || '/usr/local/bin/chromium';
const useLocalChromium = !isCI && fs.existsSync(localChromium);

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false, // 涉及同一后端数据库，串行更稳
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // 本地：显式指向系统 chromium；CI：使用 Playwright 下载的浏览器（默认行为）
    ...(useLocalChromium
      ? {
          launchOptions: {
            executablePath: localChromium,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
          },
        }
      : {}),
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

  // 服务器：本地复用常驻实例；CI 自动启动（含种子管理员密码）
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !isCI,
    timeout: 120 * 1000,
    env: {
      ...process.env,
      // CI 首启种子管理员口令（本地由 .env.local 提供，无影响）
      AMS_ADMIN_PASSWORD: process.env.AMS_ADMIN_PASSWORD || 'Ams-Debug#2026',
    },
  },
});
