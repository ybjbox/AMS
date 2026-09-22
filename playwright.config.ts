import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import { config } from 'dotenv';

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

// 本地 admin 口令只在 .env.local 里（服务端也是读它）。这里同样读进来，
// 好让 worker 进程与 webServer 拿到的 AMS_ADMIN_PASSWORD 跟服务端一致。
if (!process.env.AMS_ADMIN_PASSWORD) {
  config({ path: '.env.local', quiet: true });
}

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false, // 涉及同一后端数据库，串行更稳
  forbidOnly: isCI,
  // CI runner 性能波动较大（冷启动接近超时边缘）：重试 2 次
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    // 统一 127.0.0.1：CI runner 上 localhost 可能解析为 IPv6 ::1，
    // 而服务器默认绑定 IPv4 127.0.0.1，导致连接失败（本地/CI 表现不一致）。
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
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

  // 服务器：
  // - 本地：复用常驻 dev 实例（有 HMR，随时调试）
  // - CI：先生产构建再用静态产物启动——dev 模式（Vite 按需编译）在
  //   CI 冷启动时过慢（2 核无缓存），是 E2E 超时的主要根因；
  //   生产模式启动快、无编译期、确定性高（这也是 CI 惯例）。
  webServer: {
    command: isCI ? 'npm run build && npx tsx server.ts' : 'npm run dev',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !isCI,
    timeout: 240 * 1000, // 构建 + 启动的余量
    env: {
      ...process.env,
      // CI 用生产模式（静态服务 + 无 Vite middleware）
      ...(isCI ? { NODE_ENV: 'production' } : {}),
      // AMS_ADMIN_PASSWORD 随上面的 ...process.env 带进来（本地来自 .env.local，
      // CI 由 workflow 每次运行现生成）。仓库里不再保留兜底口令；两处都没有时
      // 服务端会随机生成并写 data/ADMIN_CREDENTIALS.txt。
    },
  },
});
