import { db, onDbReload } from "./db.ts";
import { asString } from "./sqliteUtil.ts";

/**
 * AI 助手对话持久化层。
 *
 * 存储：ai_conversations 表，messages 以 JSON 文本保存（前端传来的是
 * [{role,content}]，结构稳定、无需拆列）。每个对话归属单个 username，
 * 所有读写都按 username 强制隔离，跨用户不可见。
 *
 * 安全：表创建与 prepared statement 都在模块作用域；恢复备份会热重载连接，
 * 通过 onDbReload 把缓存语句重新 prepare，避免指向已关闭的旧连接。
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_conversations (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    title      TEXT DEFAULT '新对话',
    messages   TEXT NOT NULL DEFAULT '[]',
    createdAt  TEXT DEFAULT (datetime('now','localtime')),
    updatedAt  TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_conv_username ON ai_conversations(username, updatedAt);
`);

export interface StoredMsg {
  role: "user" | "assistant";
  content: string;
}

const LIST_SQL = `SELECT id, title, updatedAt, messages FROM ai_conversations WHERE username = ? ORDER BY updatedAt DESC`;
let listStmt = db.prepare(LIST_SQL);

const GET_SQL = `SELECT id, username, title, messages, createdAt, updatedAt FROM ai_conversations WHERE id = ?`;
let getStmt = db.prepare(GET_SQL);

const INSERT_SQL = `INSERT INTO ai_conversations (id, username, title, messages, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`;
let insertStmt = db.prepare(INSERT_SQL);

const UPDATE_SQL = `UPDATE ai_conversations SET title = ?, messages = ?, updatedAt = datetime('now','localtime')
  WHERE id = ? AND username = ?`;
let updateStmt = db.prepare(UPDATE_SQL);

const DELETE_SQL = `DELETE FROM ai_conversations WHERE id = ? AND username = ?`;
let deleteStmt = db.prepare(DELETE_SQL);

const CLEAR_ALL_SQL = `DELETE FROM ai_conversations`;
let clearAllStmt = db.prepare(CLEAR_ALL_SQL);

const PRUNE_SQL = `DELETE FROM ai_conversations WHERE updatedAt < datetime('now','localtime', ?)`;
let pruneStmt = db.prepare(PRUNE_SQL);

onDbReload(() => {
  listStmt = db.prepare(LIST_SQL);
  getStmt = db.prepare(GET_SQL);
  insertStmt = db.prepare(INSERT_SQL);
  updateStmt = db.prepare(UPDATE_SQL);
  deleteStmt = db.prepare(DELETE_SQL);
  clearAllStmt = db.prepare(CLEAR_ALL_SQL);
  pruneStmt = db.prepare(PRUNE_SQL);
});

export interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface Conversation extends ConversationMeta {
  username: string;
  messages: StoredMsg[];
  createdAt: string;
}

function parseMessages(json: string): StoredMsg[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as StoredMsg[]) : [];
  } catch {
    return [];
  }
}

export function listConversations(username: string): ConversationMeta[] {
  return listStmt.all(username).map((r) => ({
    id: asString(r.id),
    title: asString(r.title),
    updatedAt: asString(r.updatedAt),
    messageCount: parseMessages(asString(r.messages)).length,
  }));
}

export function getConversation(id: string): Conversation | null {
  const r = getStmt.get(id);
  if (!r) return null;
  return {
    id: asString(r.id),
    username: asString(r.username),
    title: asString(r.title),
    messages: parseMessages(asString(r.messages)),
    createdAt: asString(r.createdAt),
    updatedAt: asString(r.updatedAt),
    messageCount: 0,
  };
}

export function createConversation(
  username: string,
  title: string,
  messages: StoredMsg[]
): string {
  const id = crypto.randomUUID();
  insertStmt.run(id, username, title || "新对话", JSON.stringify(messages ?? []));
  return id;
}

export function updateConversation(
  id: string,
  username: string,
  title: string,
  messages: StoredMsg[]
): boolean {
  const res = updateStmt.run(title || "新对话", JSON.stringify(messages ?? []), id, username);
  return res.changes > 0;
}

export function deleteConversation(id: string, username: string): boolean {
  const res = deleteStmt.run(id, username);
  return res.changes > 0;
}

// --------------------------------------------------------------- 审计（超管：跨用户）

const LIST_ALL_SQL = `SELECT id, username, title, updatedAt, messages FROM ai_conversations ORDER BY updatedAt DESC`;
let listAllStmt = db.prepare(LIST_ALL_SQL);

const GET_ADMIN_SQL = `SELECT id, username, title, messages, createdAt, updatedAt FROM ai_conversations WHERE id = ?`;
let getAdminStmt = db.prepare(GET_ADMIN_SQL);

const DELETE_ADMIN_SQL = `DELETE FROM ai_conversations WHERE id = ?`;
let deleteAdminStmt = db.prepare(DELETE_ADMIN_SQL);

onDbReload(() => {
  listStmt = db.prepare(LIST_SQL);
  getStmt = db.prepare(GET_SQL);
  insertStmt = db.prepare(INSERT_SQL);
  updateStmt = db.prepare(UPDATE_SQL);
  deleteStmt = db.prepare(DELETE_SQL);
  listAllStmt = db.prepare(LIST_ALL_SQL);
  getAdminStmt = db.prepare(GET_ADMIN_SQL);
  deleteAdminStmt = db.prepare(DELETE_ADMIN_SQL);
});

/** 超管审计：列出全部用户的对话（含归属用户名），按更新时间倒序。 */
export function listAllConversations(): ConversationMeta[] {
  return listAllStmt.all().map((r) => ({
    id: asString(r.id),
    username: asString(r.username),
    title: asString(r.title),
    updatedAt: asString(r.updatedAt),
    messageCount: parseMessages(asString(r.messages)).length,
  }));
}

/** 超管审计：读取任意对话详情（不按 username 隔离）。 */
export function getConversationAdmin(id: string): Conversation | null {
  const r = getAdminStmt.get(id);
  if (!r) return null;
  return {
    id: asString(r.id),
    username: asString(r.username),
    title: asString(r.title),
    messages: parseMessages(asString(r.messages)),
    createdAt: asString(r.createdAt),
    updatedAt: asString(r.updatedAt),
    messageCount: 0,
  };
}

/** 超管审计：删除任意对话。返回是否真的删除了记录。 */
export function deleteConversationAdmin(id: string): boolean {
  const res = deleteAdminStmt.run(id);
  return res.changes > 0;
}

/** 超管审计：清空全部对话（所有用户）。返回删除的记录数。 */
export function clearAllConversations(): number {
  const res = clearAllStmt.run();
  return Number(res.changes);
}

/**
 * 按保留期清理过期对话：删除 updatedAt 早于 retentionDays 天前的记录。
 * retentionDays <= 0 视为关闭，不删除任何记录。返回删除的记录数。
 */
export function pruneConversations(retentionDays: number): number {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const res = pruneStmt.run(`-${Math.floor(retentionDays)} days`);
  return Number(res.changes);
}
