/**
 * 通知归并（refKey）回归测试 —— 对应「侧边栏待办 2 条、头像未读 6 条」不一致的修复。
 *
 * 背景：合同到期/转正提醒的文案带「剩余 N 天」，旧的「标题 + 全文」去重每天失配一次，
 * 未读通知按天累积；待办侧因按 type+targetId 去重保持稳定，两个角标于是分叉。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test，与开发库完全隔离。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db.ts';
import { runMigrations, migrateNotificationRefKeys } from '../migrate.ts';
import { createNotification, markNotificationRead } from '../notificationsDb.ts';

const RECIPIENT = 'notif-dedupe-it-test';

const countOf = (refKey: string) =>
  (
    db
      .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE recipient = ? AND refKey = ?`)
      .get(RECIPIENT, refKey) as { n: number }
  ).n;

const rowsOf = (refKey: string) =>
  db
    .prepare(
      `SELECT id, message, read FROM notifications WHERE recipient = ? AND refKey = ? ORDER BY createdAt`
    )
    .all(RECIPIENT, refKey) as Array<{ id: string; message: string; read: number }>;

beforeAll(() => {
  runMigrations();
  db.prepare(`DELETE FROM notifications WHERE recipient = ?`).run(RECIPIENT);
});

describe('createNotification 的 refKey 归并', () => {
  it('同一 refKey 的未读提醒再次触发时原地刷新文案，不新增条目', () => {
    const first = createNotification({
      title: '合同到期提醒',
      message: '员工 34 (EMP0034) 的合同将于 2026-09-21 到期（剩余 3 天）',
      type: 'warning',
      recipient: RECIPIENT,
      refKey: 'contract:EMP0034',
    });
    const second = createNotification({
      title: '合同到期提醒',
      message: '员工 34 (EMP0034) 的合同将于 2026-09-21 到期（剩余 2 天）',
      type: 'warning',
      recipient: RECIPIENT,
      refKey: 'contract:EMP0034',
    });

    expect(second.id).toBe(first.id);
    expect(countOf('contract:EMP0034')).toBe(1);
    expect(rowsOf('contract:EMP0034')[0].message).toContain('剩余 2 天');
  });

  it('不同 refKey（不同员工）各自独立，不会被误归并', () => {
    createNotification({
      title: '合同到期提醒',
      message: '员工 45 (EMP0045) 的合同将于 2026-10-01 到期（剩余 13 天）',
      type: 'warning',
      recipient: RECIPIENT,
      refKey: 'contract:EMP0045',
    });
    expect(countOf('contract:EMP0045')).toBe(1);
    expect(countOf('contract:EMP0034')).toBe(1);
  });

  it('已读后再次触发会生成新条目（提醒重新出现在未读里）', () => {
    const before = rowsOf('contract:EMP0045')[0];
    markNotificationRead(before.id, RECIPIENT);
    const after = createNotification({
      title: '合同到期提醒',
      message: '员工 45 (EMP0045) 的合同将于 2026-10-01 到期（剩余 12 天）',
      type: 'warning',
      recipient: RECIPIENT,
      refKey: 'contract:EMP0045',
    });
    expect(after.id).not.toBe(before.id);
    expect(after.read).toBe(false);
    expect(countOf('contract:EMP0045')).toBe(2);
  });

  it('不带 refKey 时保留原有「标题 + 全文」未读去重', () => {
    const one = createNotification({
      title: '一次性提醒',
      message: '保存失败',
      recipient: RECIPIENT,
    });
    const two = createNotification({
      title: '一次性提醒',
      message: '保存失败',
      recipient: RECIPIENT,
    });
    expect(two.id).toBe(one.id);
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE recipient = ? AND refKey = ''`)
          .get(RECIPIENT) as { n: number }
      ).n
    ).toBe(1);
  });
});

describe('v9 迁移：存量重复未读归并', () => {
  const LEGACY = 'notif-legacy-it-test';

  beforeAll(() => {
    db.prepare(`DELETE FROM notifications WHERE recipient = ?`).run(LEGACY);
    const insert = db.prepare(
      `INSERT INTO notifications (id, title, message, type, read, recipient, createdAt, refKey)
       VALUES (?, '合同到期提醒', ?, 'warning', 0, ?, ?, '')`
    );
    // 同一个人连续三天各生成一条未读（旧文案含「剩余 N 天」，全文去重失效）
    insert.run('legacy-1', '员工 88 (EMP0088) 的合同将于 2026-09-21 到期（剩余 5 天）', LEGACY, '2026-09-16 08:00:00');
    insert.run('legacy-2', '员工 88 (EMP0088) 的合同将于 2026-09-21 到期（剩余 4 天）', LEGACY, '2026-09-17 08:00:00');
    insert.run('legacy-3', '员工 88 (EMP0088) 的合同将于 2026-09-21 到期（剩余 3 天）', LEGACY, '2026-09-18 08:00:00');
    // 另一员工 + 一条无归并键的一次性通知，都不应被牵连
    insert.run('legacy-other', '员工 89 (EMP0089) 的合同将于 2026-09-25 到期（剩余 7 天）', LEGACY, '2026-09-18 08:00:00');
    insert.run('legacy-once', '系统维护窗口定于本周日', LEGACY, '2026-09-18 08:00:00');
  });

  it('回填 refKey 并按 (recipient, refKey) 只保留最新一条，其余文案无关的通知不动', () => {
    migrateNotificationRefKeys();

    const kept = db
      .prepare(`SELECT id, refKey, message FROM notifications WHERE recipient = ? AND refKey = 'contract:EMP0088'`)
      .all(LEGACY) as Array<{ id: string; refKey: string; message: string }>;
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('legacy-3');
    expect(kept[0].message).toContain('剩余 3 天');

    const remaining = db
      .prepare(`SELECT id, refKey FROM notifications WHERE recipient = ?`)
      .all(LEGACY) as Array<{ id: string; refKey: string }>;
    expect(remaining.map((r) => r.id).sort()).toEqual(['legacy-3', 'legacy-once', 'legacy-other']);
    expect(remaining.find((r) => r.id === 'legacy-once')!.refKey).toBe('');
    expect(remaining.find((r) => r.id === 'legacy-other')!.refKey).toBe('contract:EMP0089');
  });

  it('幂等：重复执行不再改动数据', () => {
    const before = db
      .prepare(`SELECT id, refKey, message FROM notifications WHERE recipient = ? ORDER BY id`)
      .all(LEGACY);
    migrateNotificationRefKeys();
    expect(
      db.prepare(`SELECT id, refKey, message FROM notifications WHERE recipient = ? ORDER BY id`).all(LEGACY)
    ).toEqual(before);
  });
});
