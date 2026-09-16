/**
 * 公告数据层（P0 闭环：公告发布的存储）。
 *
 * 设计：
 * - announcements 表：标题 / 正文 / 优先级（normal|important）/ 发布人 / 有效期 / 启用态
 * - 全员可见（列表接口读取"有效公告"：未过期 + 启用）；管理操作仅 ADMIN+（路由层）
 * - 删除为硬删除（公告字段量小，无敏感信息，无需软删除归档）
 */
import { db } from "./db.ts";
import { type DbRow, asString, asNumber } from "./sqliteUtil.ts";
import { randomUUID } from "node:crypto";

export interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  /** 'normal' | 'important' */
  priority: string;
  publisher: string;
  createdAt: string;
  /** 有效期（YYYY-MM-DD，空=永久） */
  expiresAt: string;
  /** 1=启用 0=停用 */
  active: number;
}

function ensureAnnouncementsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      publisher TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT '',
      expiresAt TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active)`);
}
ensureAnnouncementsTable();

function rowToAnnouncement(row: DbRow): AnnouncementRow {
  return {
    id: asString(row.id),
    title: asString(row.title),
    content: asString(row.content),
    priority: asString(row.priority) || "normal",
    publisher: asString(row.publisher),
    createdAt: asString(row.createdAt),
    expiresAt: asString(row.expiresAt),
    active: asNumber(row.active) ? 1 : 0,
  };
}

/** 是否在有效期内（空 expiresAt = 永久有效） */
function isEffective(row: AnnouncementRow, today: string): boolean {
  if (!row.expiresAt) return true;
  return row.expiresAt >= today;
}

/**
 * 对全员可见的公告（启用 + 未过期），重要优先、其次按发布时间倒序。
 * limit 为空时返回全部（管理列表用 listAll 不受此限）。
 */
export function listEffectiveAnnouncements(limit?: number): AnnouncementRow[] {
  const rows = db
    .prepare("SELECT * FROM announcements WHERE active = 1 ORDER BY createdAt DESC, rowid DESC")
    .all()
    .map(rowToAnnouncement);
  const today = new Date().toISOString().slice(0, 10);
  const effective = rows.filter((r) => isEffective(r, today));
  // 重要置顶（稳定排序：先按优先级分组，组内保持时间倒序）
  const sorted = [
    ...effective.filter((r) => r.priority === "important"),
    ...effective.filter((r) => r.priority !== "important"),
  ];
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}

/** 管理列表：全部公告（含停用/过期） */
export function listAllAnnouncements(): AnnouncementRow[] {
  return db
    .prepare("SELECT * FROM announcements ORDER BY createdAt DESC, rowid DESC")
    .all()
    .map(rowToAnnouncement);
}

export function createAnnouncement(input: {
  title: string;
  content?: string;
  priority?: string;
  publisher: string;
  expiresAt?: string;
}): AnnouncementRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO announcements (id, title, content, priority, publisher, createdAt, expiresAt, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    input.title,
    input.content ?? "",
    input.priority === "important" ? "important" : "normal",
    input.publisher,
    new Date().toISOString(),
    input.expiresAt ?? ""
  );
  const row = db.prepare("SELECT * FROM announcements WHERE id = ?").get(id);
  if (!row) throw new Error(`createAnnouncement: 插入后未找到公告 ${id}`);
  return rowToAnnouncement(row);
}

export function updateAnnouncement(
  id: string,
  input: { title?: string; content?: string; priority?: string; expiresAt?: string; active?: number }
): AnnouncementRow | null {
  const existingRow = db.prepare("SELECT * FROM announcements WHERE id = ?").get(id);
  if (!existingRow) return null;
  const existing = rowToAnnouncement(existingRow);
  db.prepare(
    `UPDATE announcements SET title = ?, content = ?, priority = ?, expiresAt = ?, active = ? WHERE id = ?`
  ).run(
    input.title ?? existing.title,
    input.content ?? existing.content,
    input.priority ?? existing.priority,
    input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
    input.active === undefined ? existing.active : input.active ? 1 : 0,
    id
  );
  const row = db.prepare("SELECT * FROM announcements WHERE id = ?").get(id);
  return row ? rowToAnnouncement(row) : null;
}

export function deleteAnnouncement(id: string): boolean {
  const result = db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
  return result.changes > 0;
}
