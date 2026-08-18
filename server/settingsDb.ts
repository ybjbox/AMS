/**
 * 通用 key-value 配置持久化层（P1-6）。
 *
 * 之前主题配置（/api/themes）只存在 server.ts 的内存变量里，进程一重启就回到默认，
 * 管理员辛苦调好的导出配色全丢。这里落到一个 SQLite `settings` 表（key TEXT PK + value TEXT），
 * 任何需要「重启不丢」的小配置都可以走它。
 *
 * 设计要点：
 * - 所有函数都不抛出：读不到 / 解析失败一律回退 undefined，写失败仅 console.error。
 *   调用方（server.ts）据此决定「内存缓存更新 / 返回 500」等行为，而不是让这里把请求搞崩。
 * - value 统一 JSON 序列化，所以既能存对象也能存标量。
 */
import { db } from "./db.ts";

export const SETTINGS_KEY_THEMES = "themes";

/** 防御式建表：保证 settings 表存在（migrate 也会建，这里幂等兜底，避免依赖调用顺序）。 */
function ensureSettingsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key       TEXT PRIMARY KEY,
      value     TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
}
ensureSettingsTable();

export function getSetting<T = unknown>(key: string): T | undefined {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.value) as T;
  } catch (e) {
    console.error(`[settings] 读取 key=${key} 失败：`, e);
    return undefined;
  }
}

export function setSetting(key: string, value: unknown): void {
  try {
    db.prepare(
      `INSERT INTO settings (key, value, updatedAt)
       VALUES (?, ?, datetime('now', 'localtime'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now', 'localtime')`
    ).run(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[settings] 写入 key=${key} 失败：`, e);
    throw e; // 调用方需要知道持久化是否成功
  }
}

// ---------- 主题便捷封装 ----------

export type ThemeMap = Record<string, Record<string, unknown>>;

export function getThemes(): ThemeMap | undefined {
  return getSetting<ThemeMap>(SETTINGS_KEY_THEMES);
}

export function setThemes(themes: ThemeMap): void {
  setSetting(SETTINGS_KEY_THEMES, themes);
}
