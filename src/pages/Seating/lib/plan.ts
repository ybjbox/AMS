import type { User } from '@/types';
import type { Table, TableCapacity } from '../hooks/useSeatingArrange';

/**
 * 座位方案的序列化：只存工号，不存姓名快照。
 *
 * 载入时按当前员工档案重新解析 —— 员工改了名字/部门，方案跟着变；
 * 员工被删了，则归入 missing 由界面提示，而不是悄悄留一个空座。
 */
export interface SeatingPlanPayload {
  version: 1;
  skippedNumbers: string;
  capacities: { tableNumber: number; capacity: number }[];
  tables: { number: number; memberIds: string[] }[];
}

export interface SeatingPlanState {
  tableCapacities: TableCapacity[];
  tables: Table[];
  skippedNumbers: string;
}

export function serializePlan(input: {
  tableCapacities: TableCapacity[];
  tables: Table[];
  skippedNumbers: string;
}): SeatingPlanPayload {
  return {
    version: 1,
    skippedNumbers: input.skippedNumbers,
    capacities: input.tableCapacities.map((tc) => ({
      tableNumber: tc.tableNumber,
      capacity: tc.capacity,
    })),
    tables: input.tables.map((t) => ({ number: t.number, memberIds: t.members.map((m) => m.id) })),
  };
}

export interface PlanApplyResult extends SeatingPlanState {
  /** 方案里有、但当前员工档案已经找不到的工号 */
  missing: string[];
}

export function applyPlan(payload: SeatingPlanPayload | null, users: User[]): PlanApplyResult {
  const fallback: PlanApplyResult = {
    tableCapacities: [],
    tables: [],
    skippedNumbers: '4,14,24',
    missing: [],
  };
  if (!payload || !Array.isArray(payload.tables)) return fallback;

  const byId = new Map(users.map((u) => [u.id, u]));
  const missing = new Set<string>();

  const tables: Table[] = payload.tables
    .map((t) => {
      const members: User[] = [];
      for (const id of t.memberIds || []) {
        const u = byId.get(id);
        if (u) members.push(u);
        else missing.add(id);
      }
      return { number: t.number, members };
    })
    // 全员都被删掉的桌子不再重建，否则会凭空多一张空桌
    .filter((t) => t.members.length > 0);

  const capacities: TableCapacity[] = (payload.capacities || []).map((c) => ({
    id: `plan-table-${c.tableNumber}`,
    tableNumber: c.tableNumber,
    capacity: Math.max(1, Number(c.capacity) || 1),
  }));

  return {
    tableCapacities: capacities.length ? capacities : fallback.tableCapacities,
    tables,
    skippedNumbers: typeof payload.skippedNumbers === 'string' ? payload.skippedNumbers : fallback.skippedNumbers,
    missing: [...missing],
  };
}
