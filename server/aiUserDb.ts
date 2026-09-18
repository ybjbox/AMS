import { db, onDbReload } from "./db.ts";
import { asString, asNumber } from "./sqliteUtil.ts";

/**
 * AI 助手「个人模型」配置 + 系统额度用量记录。
 *
 * 设计：
 * - user_ai_config：员工自行配置的 OpenAI 兼容模型（baseUrl/apiKey/model）。
 *   配置齐全时对话走自己的凭据，不占用系统额度；apiKey 属敏感凭据，
 *   接口读取一律脱敏，只在服务端使用。
 * - ai_usage：按 (username, day) 记录系统额度的当日使用次数（一次用户提问 = 1 次）。
 *   用表存储而非内存计数，保证服务重启后当天额度依然有效。
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS user_ai_config (
    username   TEXT PRIMARY KEY,
    baseUrl    TEXT NOT NULL DEFAULT '',
    apiKey     TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    updatedAt  TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS ai_usage (
    username  TEXT NOT NULL,
    day       TEXT NOT NULL,
    used      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (username, day)
  );
`);

export interface UserAiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const GET_SQL = `SELECT baseUrl, apiKey, model FROM user_ai_config WHERE username = ?`;
let getStmt = db.prepare(GET_SQL);

const UPSERT_SQL = `INSERT INTO user_ai_config (username, baseUrl, apiKey, model, updatedAt)
  VALUES (?, ?, ?, ?, datetime('now','localtime'))
  ON CONFLICT(username) DO UPDATE SET
    baseUrl=excluded.baseUrl, apiKey=excluded.apiKey, model=excluded.model, updatedAt=excluded.updatedAt`;
let upsertStmt = db.prepare(UPSERT_SQL);

const DELETE_SQL = `DELETE FROM user_ai_config WHERE username = ?`;
let deleteStmt = db.prepare(DELETE_SQL);

const USAGE_SQL = `SELECT used FROM ai_usage WHERE username = ? AND day = ?`;
let usageStmt = db.prepare(USAGE_SQL);

const INC_SQL = `INSERT INTO ai_usage (username, day, used) VALUES (?, ?, 1)
  ON CONFLICT(username, day) DO UPDATE SET used = used + 1`;
let incStmt = db.prepare(INC_SQL);

const TODAY_LIST_SQL = `SELECT username, used FROM ai_usage WHERE day = ? ORDER BY used DESC`;
let todayListStmt = db.prepare(TODAY_LIST_SQL);

// 用量表只保留最近 8 天（额度按天生效，历史计数无业务价值，防膨胀）
const PRUNE_USAGE_SQL = `DELETE FROM ai_usage WHERE day < ?`;
let pruneUsageStmt = db.prepare(PRUNE_USAGE_SQL);

onDbReload(() => {
  getStmt = db.prepare(GET_SQL);
  upsertStmt = db.prepare(UPSERT_SQL);
  deleteStmt = db.prepare(DELETE_SQL);
  usageStmt = db.prepare(USAGE_SQL);
  incStmt = db.prepare(INC_SQL);
  todayListStmt = db.prepare(TODAY_LIST_SQL);
  pruneUsageStmt = db.prepare(PRUNE_USAGE_SQL);
});

/** 今天（本地日期，YYYY-MM-DD），与 SQLite datetime('now','localtime') 口径一致 */
export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 读个人模型配置；未配置返回 null。 */
export function getUserAiConfig(username: string): UserAiConfig | null {
  const r = getStmt.get(username);
  if (!r) return null;
  return { baseUrl: asString(r.baseUrl), apiKey: asString(r.apiKey), model: asString(r.model) };
}

/** 判断个人配置是否足以独立发起对话（三项齐全才算启用）。 */
export function isUserAiConfigUsable(c: UserAiConfig | null): boolean {
  return !!c && !!c.baseUrl.trim() && !!c.apiKey.trim() && !!c.model.trim();
}

/** 写个人模型配置：仅更新传入字段，其余保持现状（apiKey 留空 = 不改）。 */
export function setUserAiConfig(username: string, p: Partial<UserAiConfig>): UserAiConfig {
  const cur = getUserAiConfig(username) ?? { baseUrl: "", apiKey: "", model: "" };
  const next: UserAiConfig = {
    baseUrl: p.baseUrl !== undefined ? p.baseUrl : cur.baseUrl,
    apiKey: p.apiKey !== undefined && p.apiKey !== "" ? p.apiKey : cur.apiKey,
    model: p.model !== undefined ? p.model : cur.model,
  };
  upsertStmt.run(username, next.baseUrl, next.apiKey, next.model);
  return next;
}

/** 删除个人配置（回退到系统额度）。 */
export function clearUserAiConfig(username: string): void {
  deleteStmt.run(username);
}

/** 当日已用次数。 */
export function getUsageToday(username: string): number {
  const r = usageStmt.get(username, todayStr());
  return r ? asNumber(r.used) : 0;
}

/** 记一次使用（在放行系统额度请求时调用）。 */
export function incrementUsage(username: string): void {
  incStmt.run(username, todayStr());
}

/** 管理视角：今天所有用户的用量。 */
export function listTodayUsage(): { username: string; used: number }[] {
  return todayListStmt.all(todayStr()).map((r) => ({
    username: asString(r.username),
    used: asNumber(r.used),
  }));
}

const LIST_PERSONAL_SQL = `SELECT username FROM user_ai_config
  WHERE trim(baseUrl) <> '' AND trim(apiKey) <> '' AND trim(model) <> '' ORDER BY username`;
let listPersonalStmt = db.prepare(LIST_PERSONAL_SQL);
onDbReload(() => {
  listPersonalStmt = db.prepare(LIST_PERSONAL_SQL);
});

/** 管理视角：已配置且启用个人模型的用户名单。 */
export function listPersonalModelUsers(): string[] {
  return listPersonalStmt.all().map((r) => asString(r.username));
}

/** 清理 8 天前的用量记录。 */
export function pruneUsageHistory(): void {
  const d = new Date();
  d.setDate(d.getDate() - 8);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  pruneUsageStmt.run(`${d.getFullYear()}-${m}-${day}`);
}
pruneUsageHistory();
