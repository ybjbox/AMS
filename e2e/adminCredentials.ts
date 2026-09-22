import fs from 'fs';
import path from 'path';

/**
 * e2e 侧解析 admin 口令：仓库里不再保存任何默认口令。
 *
 * 顺序与服务端一致：
 *   1) AMS_ADMIN_PASSWORD —— 本地由 .env.local 提供（playwright.config 里 dotenv 读进来），
 *      CI 由 workflow 每次运行现生成；走这条路 seed 出来的 admin 不必首登改密，用例能直接登录。
 *   2) DATA_DIR/ADMIN_CREDENTIALS.txt —— 没给环境变量时服务端会随机生成并写下这个文件。
 *      注意这种 admin 带 mustChangePassword，UI 用例会先被赶去改密，只适合脚本化取 token 的场景。
 *   3) 都没有就报错说清缺什么，而不是回退到一个提交进仓库的口令。
 */
export function resolveAdminPassword(): string {
  const fromEnv = process.env.AMS_ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;

  const file = path.resolve(process.env.DATA_DIR || 'data', 'ADMIN_CREDENTIALS.txt');
  if (fs.existsSync(file)) {
    const matched = /^密码:\s*(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
    if (matched) return matched[1].trim();
  }

  throw new Error(
    `拿不到 admin 口令：设 AMS_ADMIN_PASSWORD（本地也可写进 .env.local），` +
      `或先让服务端首启生成 ${file}`
  );
}
