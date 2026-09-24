/**
 * 提交后副作用（批次 A2）：出站通知/webhook/邮件不可撤回，
 * 所以"事务回滚了但邮件已经发出去"必须是结构上不可能发生的事。
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../notifyDispatch.ts', () => ({ dispatchOutbound: vi.fn() }));

import { dispatchOutbound } from '../notifyDispatch.ts';
import { createNotification, ensureNotificationsTable } from '../notificationsDb.ts';
import { db, transact } from '../db.ts';

const RECIPIENT = 'after-commit-tester';
const mockDispatch = vi.mocked(dispatchOutbound);

function make(title: string, refKey?: string) {
  return createNotification({ recipient: RECIPIENT, title, message: 'm', type: 'info', refKey });
}

beforeEach(() => {
  ensureNotificationsTable();
  mockDispatch.mockClear();
  db.prepare('DELETE FROM notifications WHERE recipient = ?').run(RECIPIENT);
});

afterAll(() => {
  db.prepare('DELETE FROM notifications WHERE recipient = ?').run(RECIPIENT);
});

describe('onAfterCommit 与事务的时序', () => {
  it('不在事务里：照常立即推出站（与改动前行为一致）', () => {
    make('直发一条');
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('事务提交后才推；事务体内还看不到它被推出', () => {
    let seenInside = -1;
    transact(() => {
      make('提交后才发');
      seenInside = mockDispatch.mock.calls.length;
    });
    expect(seenInside).toBe(0); // 事务体内还没发
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('事务回滚：一条都不推，并留下丢弃日志所需的计数（不静默）', () => {
    expect(() =>
      transact(() => {
        make('会被回滚');
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) c FROM notifications WHERE recipient = ?').get(RECIPIENT)).toEqual({ c: 0 });
  });

  it('嵌套 transact 并入外层：内层提交不触发，外层提交才触发一次', () => {
    let insideInner = -1;
    transact(() => {
      transact(() => {
        make('嵌套内层');
      });
      insideInner = mockDispatch.mock.calls.length;
    });
    expect(insideInner).toBe(0);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('副作用自己抛错不影响业务结果（出站通道挂了不代表审批失败）', () => {
    mockDispatch.mockImplementationOnce(() => {
      throw new Error('smtp down');
    });
    const row = transact(() => make('出站会抛错'));
    expect(row.title).toBe('出站会抛错');
    expect(db.prepare('SELECT COUNT(*) c FROM notifications WHERE id = ?').get(row.id)).toEqual({ c: 1 });
  });
});
