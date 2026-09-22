import type { User } from '@/types';
import type { Table, TableCapacity } from '../hooks/useSeatingArrange';

/**
 * 手动排座的纯逻辑。
 *
 * 座次顺序就是打印时的序号（PrintPreview 按 members 下标出 1..n），所以这里既管「换桌」
 * 也管「桌内换序」，两者是同一次操作：从原位置摘出来，插到目标位置前（不给 before 就 append）。
 */
export interface MoveSpec {
  userId: string;
  /** null = 移出座位，回到未入座池 */
  toTable: number | null;
  /** 插到该成员之前；省略或找不到就追加到桌尾 */
  beforeMemberId?: string | null;
}

export type MoveBlock = 'not-found' | 'already-there' | 'full' | 'no-such-table';

export type MoveResult = { ok: true; tables: Table[]; message: string } | { ok: false; reason: MoveBlock };

export interface MoveContext {
  tables: Table[];
  /** 未入座的人（参与名单里没被排上任何桌的） */
  pool: User[];
  /** 桌号 → 人数上限；缺项按不限处理（历史上存在没有容量记录的桌） */
  capacities: Record<number, number>;
}

export function tableOf(tables: Table[], userId: string): number | null {
  return tables.find((t) => t.members.some((m) => m.id === userId))?.number ?? null;
}

/** 参与名单减去已入座 = 未入座池（顺序沿用名单，避免同一个人每次刷新换个位置） */
export function unseatedMembers(users: User[], tables: Table[]): User[] {
  const seated = new Set(tables.flatMap((t) => t.members.map((m) => m.id)));
  return users.filter((u) => !seated.has(u.id));
}

export function applyMove(ctx: MoveContext, spec: MoveSpec): MoveResult {
  const { tables, pool, capacities } = ctx;
  const seatedOn = tableOf(tables, spec.userId);
  const person =
    tables.flatMap((t) => t.members).find((m) => m.id === spec.userId) ?? pool.find((u) => u.id === spec.userId);
  if (!person) return { ok: false, reason: 'not-found' };

  const label = person.name;

  // 移出
  if (spec.toTable === null) {
    if (seatedOn === null) return { ok: false, reason: 'already-there' };
    return {
      ok: true,
      message: `已把 ${label} 移到未入座`,
      tables: tables.map((t) => (t.number === seatedOn ? { ...t, members: t.members.filter((m) => m.id !== spec.userId) } : t)),
    };
  }

  const target = tables.find((t) => t.number === spec.toTable);
  if (!target) return { ok: false, reason: 'no-such-table' };

  const sameTable = seatedOn === spec.toTable;
  // 在同一桌里松在自己原位上：什么都不变，别把这种操作记成「已修改」
  if (sameTable && (spec.beforeMemberId === spec.userId || (!spec.beforeMemberId && target.members.length <= 1))) {
    return { ok: false, reason: 'already-there' };
  }

  const capacity = capacities[spec.toTable];
  // 换桌才要查容量；同桌换序不会让人变多
  if (!sameTable && Number.isFinite(capacity) && target.members.length >= capacity) {
    return { ok: false, reason: 'full' };
  }

  const withoutPerson = tables
    .map((t) => (t.number === seatedOn ? { ...t, members: t.members.filter((m) => m.id !== spec.userId) } : t))
    .map((t) => (t.number === spec.toTable ? { ...t, members: t.members.filter((m) => m.id !== spec.userId) } : t));

  const nextTables = withoutPerson.map((t) => {
    if (t.number !== spec.toTable) return t;
    const at = t.members.findIndex((m) => m.id === spec.beforeMemberId);
    if (at < 0) return { ...t, members: [...t.members, person] };
    return { ...t, members: [...t.members.slice(0, at), person, ...t.members.slice(at)] };
  });

  return {
    ok: true,
    message: sameTable ? `已调整 ${label} 在 ${spec.toTable} 号桌的座次` : `已把 ${label} 移到 ${spec.toTable} 号桌`,
    tables: nextTables,
  };
}

export type RenameBlock = 'same' | 'invalid' | 'skipped' | 'taken' | 'not-found';

/**
 * 改桌号。桌号是画布与「各桌人数设置」之间唯一的关联键（方案 payload 也按桌号存容量），
 * 所以一次改名必须同时改 tables 与 capacities，并且不许撞已存在的桌或被跳过的号 ——
 * 撞了就会出现两张同名桌，之后所有按桌号的查找都会指错。
 */
export function renameTableNumber(input: {
  tables: Table[];
  capacities: TableCapacity[];
  from: number;
  to: number;
  skippedNumbers: string;
}): { ok: true; tables: Table[]; capacities: TableCapacity[] } | { ok: false; reason: RenameBlock } {
  const { tables, capacities, from, to, skippedNumbers } = input;
  if (!Number.isInteger(to) || to < 1 || to > 999) return { ok: false, reason: 'invalid' };
  if (from === to) return { ok: false, reason: 'same' };
  const skipped = new Set(
    skippedNumbers
      .split(/[,，]/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
  );
  if (skipped.has(to)) return { ok: false, reason: 'skipped' };
  if (tables.some((t) => t.number === to)) return { ok: false, reason: 'taken' };
  if (!tables.some((t) => t.number === from)) return { ok: false, reason: 'not-found' };

  return {
    ok: true,
    tables: tables.map((t) => (t.number === from ? { ...t, number: to } : t)),
    capacities: capacities.map((tc) => (tc.tableNumber === from ? { ...tc, tableNumber: to } : tc)),
  };
}

export const RENAME_MESSAGES: Record<RenameBlock, string> = {
  same: '桌号没变',
  invalid: '桌号得是 1 到 999 之间的整数',
  skipped: '这个号在「跳过桌号」里，换一个',
  taken: '已经有这个桌号了，换一个',
  'not-found': '这一桌已经不在画布上',
};
