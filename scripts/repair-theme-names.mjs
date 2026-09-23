/**
 * 本地开发库的测试残留修复：settings.themes 里内置主题的 name 被一次 GBK 控制台的
 * curl POST 写成了 U+FFFD（源码 server/themes.ts 本身是合法 UTF-8）。
 * 只改「含 U+FFFD 的内置主题名」，其余字段与用户自建主题一律不动。
 *
 * 用法：node scripts/repair-theme-names.mjs [db 路径，默认 data/ams.db]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const dbPath = process.argv[2] || 'data/ams.db';
const db = new DatabaseSync(dbPath);

// 从源码常量取权威名称（避免手抄）
const src = readFileSync('server/themes.ts', 'utf8');
const canonical = {};
const re = /(\w+):\s*\{[^}]*?name:\s*'([^']+)'/gs;
let m;
while ((m = re.exec(src))) canonical[m[1]] = m[2];
console.log('源码内置主题名:', JSON.stringify(canonical));

const row = db.prepare("SELECT value FROM settings WHERE key='themes'").get();
if (!row) {
  console.log('无 themes 设置行，跳过');
  process.exit(0);
}
const themes = JSON.parse(row.value);
let fixed = 0;
for (const [id, theme] of Object.entries(themes)) {
  const name = String(theme?.name ?? '');
  if (!name.includes('\uFFFD')) continue;
  if (!canonical[id]) {
    console.log(`跳过 ${id}：名称损坏但源码无对应内置名（保留原样，需人工命名）`);
    continue;
  }
  themes[id] = { ...theme, name: canonical[id] };
  fixed++;
  console.log(`修复 ${id}: ${JSON.stringify(name)} → ${canonical[id]}`);
}
if (fixed) {
  db.prepare("UPDATE settings SET value = ?, updatedAt = datetime('now','localtime') WHERE key='themes'").run(JSON.stringify(themes));
  console.log(`已写回 ${fixed} 条`);
} else {
  console.log('无需修复');
}
