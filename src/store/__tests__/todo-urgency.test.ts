import { describe, it, expect } from 'vitest';
import { todoUrgency } from '../useTodoStore';
import type { Todo } from '@/types';

/**
 * 待办的催办口径。侧栏角标、首页卡、待办页顶部那排数字全读这一个函数 ——
 * 各处自己 `filter(!completed)` 时，"未完成 5" 与页面写的 "5" 只要有一处口径不同就会打架。
 */
const t = (over: Partial<Todo> = {}): Todo =>
  ({ id: Math.random().toString(36), title: 'x', completed: false, dueDate: '2026-10-12', ...over }) as Todo;

const TODAY = new Date(2026, 9, 12); // 2026-10-12 本地日

describe('todoUrgency', () => {
  it('逾期 / 今天到期 / 未完成 各算各的，互不吞掉', () => {
    const todos = [
      t({ dueDate: '2026-10-01' }), // 逾期
      t({ dueDate: '2026-10-12' }), // 今天
      t({ dueDate: '2026-10-20' }), // 以后
      t({ dueDate: '2026-10-11', completed: true }), // 已完成，什么都不算
    ];
    expect(todoUrgency(todos, TODAY)).toEqual({ pending: 3, overdue: 1, dueToday: 1 });
  });

  it('边界：昨天算逾期、今天算今天到期，不出现"既是逾期又是今天"', () => {
    expect(todoUrgency([t({ dueDate: '2026-10-11' })], TODAY)).toEqual({ pending: 1, overdue: 1, dueToday: 0 });
    expect(todoUrgency([t({ dueDate: '2026-10-12' })], TODAY)).toEqual({ pending: 1, overdue: 0, dueToday: 1 });
  });

  it('没设截止日的待办不算逾期 —— 否则它会永远挂在红色数字里', () => {
    expect(todoUrgency([t({ dueDate: '' }), t({ dueDate: undefined as unknown as string })], TODAY)).toEqual({
      pending: 2,
      overdue: 0,
      dueToday: 0,
    });
  });

  it('带时间的 ISO 串按日期部分判（服务端两种写法都有）', () => {
    expect(todoUrgency([t({ dueDate: '2026-10-11T23:30:00' })], TODAY).overdue).toBe(1);
    expect(todoUrgency([t({ dueDate: '2026-10-12T00:30:00' })], TODAY).dueToday).toBe(1);
  });
});
