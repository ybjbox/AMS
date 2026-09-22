import { describe, it, expect } from 'vitest';
import type { User } from '@/types';
import { applyMove, renameTableNumber, tableOf, unseatedMembers, type MoveContext } from './manual';
import type { Table, TableCapacity } from '../hooks/useSeatingArrange';

function u(id: string, name = id): User {
  return { id, name, department: '技术部', role: '工程师' } as User;
}

const A = u('EMP0001', '甲');
const B = u('EMP0002', '乙');
const C = u('EMP0003', '丙');
const D = u('EMP0004', '丁');

function ctx(over: Partial<MoveContext> = {}): MoveContext {
  return {
    tables: [
      { number: 1, members: [A, B] },
      { number: 2, members: [C] },
    ],
    pool: [D],
    capacities: { 1: 2, 2: 4 },
    ...over,
  };
}

const membersOf = (tables: Table[], n: number) => tables.find((t) => t.number === n)!.members.map((m) => m.id);

describe('applyMove：换桌', () => {
  it('把人从 1 号桌挪到 2 号桌，原桌少一人、目标桌追加到桌尾', () => {
    const r = applyMove(ctx(), { userId: A.id, toTable: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(membersOf(r.tables, 1)).toEqual(['EMP0002']);
    expect(membersOf(r.tables, 2)).toEqual(['EMP0003', 'EMP0001']);
    expect(r.message).toContain('2 号桌');
  });

  it('目标桌已满则拒绝，且不动原状态', () => {
    const r = applyMove(ctx(), { userId: D.id, toTable: 1 });
    expect(r).toEqual({ ok: false, reason: 'full' });
  });

  it('同一桌内部换序不受容量限制（人数没变）', () => {
    const r = applyMove(ctx(), { userId: A.id, toTable: 1, beforeMemberId: B.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(membersOf(r.tables, 1)).toEqual(['EMP0001', 'EMP0002']);
  });

  it('没有容量记录的桌按不限处理', () => {
    const r = applyMove(ctx({ capacities: { 1: 2 } }), { userId: A.id, toTable: 2 });
    expect(r.ok).toBe(true);
  });
});

describe('applyMove：桌内换序与幂等', () => {
  it('插到指定人之前，座次序号随之改变', () => {
    const tables: Table[] = [{ number: 1, members: [A, B, C] }];
    const r = applyMove(ctx({ tables, capacities: { 1: 3 } }), { userId: C.id, toTable: 1, beforeMemberId: A.id });
    expect(r.ok && membersOf(r.tables, 1)).toEqual(['EMP0003', 'EMP0001', 'EMP0002']);
  });

  it('同桌只有一人时松回自己 = 什么都不做，不记作已修改', () => {
    const r = applyMove(ctx({ tables: [{ number: 1, members: [A] }], capacities: { 1: 2 } }), {
      userId: A.id,
      toTable: 1,
    });
    expect(r).toEqual({ ok: false, reason: 'already-there' });
  });

  it('同桌里松在自己前面 = 无操作', () => {
    const r = applyMove(ctx(), { userId: A.id, toTable: 1, beforeMemberId: A.id });
    expect(r).toEqual({ ok: false, reason: 'already-there' });
  });

  it('before 指向一个不在本桌的人时退化成追加', () => {
    const r = applyMove(ctx({ capacities: { 1: 5, 2: 5 } }), { userId: C.id, toTable: 1, beforeMemberId: 'EMP9999' });
    expect(r.ok && membersOf(r.tables, 1)).toEqual(['EMP0001', 'EMP0002', 'EMP0003']);
  });
});

describe('applyMove：移出与未入座池', () => {
  it('toTable=null 把人放回未入座', () => {
    const r = applyMove(ctx(), { userId: B.id, toTable: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(membersOf(r.tables, 1)).toEqual(['EMP0001']);
    expect(r.message).toContain('未入座');
  });

  it('从未入座池直接落到某桌末尾', () => {
    const r = applyMove(ctx({ capacities: { 1: 2, 2: 4 } }), { userId: D.id, toTable: 2 });
    expect(r.ok && membersOf(r.tables, 2)).toEqual(['EMP0003', 'EMP0004']);
  });

  it('本来就没入座的人再「移出」= 无操作', () => {
    expect(applyMove(ctx(), { userId: D.id, toTable: null })).toEqual({ ok: false, reason: 'already-there' });
  });
});

describe('applyMove：异常输入', () => {
  it('目标桌不存在', () => {
    expect(applyMove(ctx(), { userId: A.id, toTable: 7 })).toEqual({ ok: false, reason: 'no-such-table' });
  });
  it('人既不在桌上也不在池里', () => {
    expect(applyMove(ctx(), { userId: 'EMP9999', toTable: 1 })).toEqual({ ok: false, reason: 'not-found' });
  });
  it('不改动传入的 tables（纯函数）', () => {
    const c = ctx();
    const snapshot = JSON.stringify(c.tables);
    applyMove(c, { userId: A.id, toTable: 2 });
    expect(JSON.stringify(c.tables)).toBe(snapshot);
  });
});

describe('周边查询', () => {
  it('tableOf 找出某人当前所在桌', () => {
    expect(tableOf(ctx().tables, B.id)).toBe(1);
    expect(tableOf(ctx().tables, D.id)).toBeNull();
  });

  it('未入座池保持名单原顺序，且已入座的都被剔掉', () => {
    expect(unseatedMembers([A, B, C, D], ctx().tables).map((x) => x.id)).toEqual(['EMP0004']);
  });
});

const caps = (...pairs: [number, number][]): TableCapacity[] =>
  pairs.map(([n, c]) => ({ id: `tc-${n}`, tableNumber: n, capacity: c }));

describe('renameTableNumber：改桌号', () => {
  const base = {
    tables: [
      { number: 1, members: [A] },
      { number: 2, members: [B] },
    ] as Table[],
    capacities: caps([1, 10], [2, 8]),
    skippedNumbers: '4,14,24',
  };

  it('改名同时换掉画布桌号与容量行的桌号（两边靠桌号关联）', () => {
    const r = renameTableNumber({ ...base, from: 1, to: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tables.map((t) => t.number)).toEqual([7, 2]);
    expect(r.capacities.map((c) => [c.tableNumber, c.capacity])).toEqual([[7, 10], [2, 8]]);
    // 成员跟着桌子走，没被复制也没丢
    expect(r.tables[0].members.map((m) => m.id)).toEqual(['EMP0001']);
  });

  it('没有对应容量行的桌也能改（只改画布）', () => {
    const r = renameTableNumber({ tables: [{ number: 9, members: [A] }], capacities: [], from: 9, to: 10, skippedNumbers: '' });
    expect(r.ok && r.tables[0].number).toBe(10);
    expect(r.ok && r.capacities).toEqual([]);
  });

  it('撞已存在的桌号 / 撞跳过的号 / 号没变 / 号不合法 / 桌不在画布，都被挡下', () => {
    expect(renameTableNumber({ ...base, from: 1, to: 2 })).toEqual({ ok: false, reason: 'taken' });
    expect(renameTableNumber({ ...base, from: 1, to: 4 })).toEqual({ ok: false, reason: 'skipped' });
    expect(renameTableNumber({ ...base, from: 1, to: 1 })).toEqual({ ok: false, reason: 'same' });
    expect(renameTableNumber({ ...base, from: 1, to: 0 })).toEqual({ ok: false, reason: 'invalid' });
    expect(renameTableNumber({ ...base, from: 1, to: 2.5 })).toEqual({ ok: false, reason: 'invalid' });
    expect(renameTableNumber({ ...base, from: 8, to: 9 })).toEqual({ ok: false, reason: 'not-found' });
  });

  it('跳过桌号支持中文逗号与空格', () => {
    expect(renameTableNumber({ ...base, from: 1, to: 14, skippedNumbers: '4， 14 ,24' }).ok).toBe(false);
  });

  it('不改动传入的数组（纯函数）', () => {
    const snapshot = JSON.stringify([base.tables, base.capacities]);
    renameTableNumber({ ...base, from: 1, to: 7 });
    expect(JSON.stringify([base.tables, base.capacities])).toBe(snapshot);
  });
});
