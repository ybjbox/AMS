/**
 * 通知数据层 — 通知是「用户级」数据，按 recipient(username) 隔离，
 * 支持跨设备/跨浏览器同步（P2-7）。也用于「派单」协作时自动给被派单人生成提醒。
 */
import { db } from './db.ts';
import { randomUUID } from 'node:crypto';
import { dispatchOutbound } from './notifyDispatch.ts';

export interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  read: number; // 0 | 1
  recipient: string;
  createdAt: string;
}

export interface NotificationInput {
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  recipient: string;
}

const ALLOWED_TYPES = new Set(['info', 'warning', 'success', 'error']);

/** 幂等建表，供迁移调用。 */
export function ensureNotificationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id        TEXT PRIMARY KEY,
      title     TEXT NOT NULL,
      message   TEXT DEFAULT '',
      type      TEXT DEFAULT 'info',
      read      INTEGER DEFAULT 0,
      recipient TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient)`
  );
}

export function rowToNotification(row: NotificationRow) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: (ALLOWED_TYPES.has(row.type) ? row.type : 'info') as
      | 'info'
      | 'warning'
      | 'success'
      | 'error',
    read: !!row.read,
    time: row.createdAt,
  };
}

export function getNotificationRaw(id: string): NotificationRow | undefined {
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as unknown as
    | NotificationRow
    | undefined;
}

/** 列出某用户作为 recipient 的全部通知（最新在前）。 */
export function listNotifications(username: string) {
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE recipient = ? ORDER BY createdAt DESC, id DESC`
    )
    .all(username) as unknown as NotificationRow[];
  return rows.map(rowToNotification);
}

/** 创建一条通知，返回归一化对象。同接收人+标题+内容且未读时去重（避免多设备/重复触发刷屏）。 */
export function createNotification(input: NotificationInput) {
  if (!input.title?.trim()) throw new Error('通知标题不能为空');
  if (!input.recipient?.trim()) throw new Error('通知接收人不能为空');
  const title = input.title.trim();
  const message = input.message ?? '';
  const recipient = input.recipient;
  const dup = db
    .prepare(
      `SELECT * FROM notifications WHERE recipient = ? AND title = ? AND message = ? AND read = 0 LIMIT 1`
    )
    .get(recipient, title, message) as NotificationRow | undefined;
  if (dup) return rowToNotification(dup);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO notifications (id, title, message, type, recipient, createdAt)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    title,
    message,
    input.type && ALLOWED_TYPES.has(input.type) ? input.type : 'info',
    recipient
  );
  // 站内落库成功后镜像推送到出站通道（webhook/邮件）；fire-and-forget，失败不影响本请求
  dispatchOutbound({ title, message, type: input.type ?? 'info', recipient });
  return rowToNotification(getNotificationRaw(id)!);
}

/** 标记单条已读（仅限 recipient 本人）。返回是否命中。 */
export function markNotificationRead(id: string, username: string): boolean {
  const info = db
    .prepare('UPDATE notifications SET read = 1 WHERE id = ? AND recipient = ?')
    .run(id, username);
  return info.changes > 0;
}

/** 全部已读（仅限 recipient 本人）。 */
export function markAllNotificationsRead(username: string): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE recipient = ?').run(username);
}

/** 删除单条（仅限 recipient 本人）。返回是否命中。 */
export function deleteNotification(id: string, username: string): boolean {
  const info = db
    .prepare('DELETE FROM notifications WHERE id = ? AND recipient = ?')
    .run(id, username);
  return info.changes > 0;
}

/** 清空某用户作为 recipient 的全部通知。 */
export function clearNotifications(username: string): void {
  db.prepare('DELETE FROM notifications WHERE recipient = ?').run(username);
}
