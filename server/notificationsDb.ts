/**
 * 通知数据层 — 通知是「用户级」数据，按 recipient(username) 隔离，
 * 支持跨设备/跨浏览器同步（P2-7）。也用于「派单」协作时自动给被派单人生成提醒。
 */
import { db, onAfterCommit } from './db.ts';
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
  /** 同类提醒的归并键（如 `contract:EMP0034`）；空串表示一次性通知，不参与归并 */
  refKey: string;
}

export interface NotificationInput {
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  recipient: string;
  /**
   * 归并键。带 refKey 的通知按「接收人 + refKey」唯一：再次触发时刷新未读条目的文案而不是新增，
   * 用于「剩余 N 天」这类每天变化的周期提醒（否则全文去重会失效，未读数只增不减）。
   */
  refKey?: string;
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
      createdAt TEXT DEFAULT (datetime('now')),
      refKey    TEXT DEFAULT ''
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient)`
  );
}
// 加载即建表，理由同 todosDb：不能把建表责任留给 migrate 的调用顺序。
ensureNotificationsTable();

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
    refKey: row.refKey || undefined,
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

/**
 * 创建一条通知，返回归一化对象。
 * - 带 refKey：按「接收人 + refKey」归并未读条目，命中则刷新文案/类型（保持首次时间，不重复推送出站通道）。
 * - 不带 refKey：按「接收人 + 标题 + 内容」且未读去重（避免多设备/重复触发刷屏）。
 */
export function createNotification(input: NotificationInput) {
  if (!input.title?.trim()) throw new Error('通知标题不能为空');
  if (!input.recipient?.trim()) throw new Error('通知接收人不能为空');
  const title = input.title.trim();
  const message = input.message ?? '';
  const recipient = input.recipient;
  const type = input.type && ALLOWED_TYPES.has(input.type) ? input.type : 'info';
  const refKey = input.refKey?.trim() ?? '';

  const existing = refKey
    ? (db
        .prepare(
          `SELECT * FROM notifications WHERE recipient = ? AND refKey = ? AND read = 0
           ORDER BY createdAt DESC, id DESC LIMIT 1`
        )
        .get(recipient, refKey) as unknown as NotificationRow | undefined)
    : (db
        .prepare(
          `SELECT * FROM notifications WHERE recipient = ? AND title = ? AND message = ? AND read = 0 LIMIT 1`
        )
        .get(recipient, title, message) as unknown as NotificationRow | undefined);
  if (existing) {
    if (refKey && (existing.message !== message || existing.type !== type)) {
      db.prepare(`UPDATE notifications SET message = ?, type = ? WHERE id = ?`).run(
        message,
        type,
        existing.id
      );
      return rowToNotification(getNotificationRaw(existing.id)!);
    }
    return rowToNotification(existing);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO notifications (id, title, message, type, recipient, createdAt, refKey)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`
  ).run(id, title, message, type, recipient, refKey);
  // 站内落库成功后镜像推送到出站通道（webhook/邮件）；fire-and-forget，失败不影响本请求。
  // 走 onAfterCommit：邮件/webhook 撤不回，事务回滚（磁盘满、database is locked）时不能已经发出去了。
  onAfterCommit(() => dispatchOutbound({ title, message, type, recipient }));
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
