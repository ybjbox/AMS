/**
 * 部门工作时段（N1 判定层的配置面）。
 *
 * 一个部门可以配多条时段（例：正常班 09:00-18:00、早班 08:00-17:00），
 * 每条带自己的工作日集合（周六上班的部门就只写 6）。判定时由 shiftMatch 按当天打卡时间挑一条。
 *
 * 继承规则：员工所在部门没配时段时，沿部门树往上找**第一个配了时段的祖先部门**并用它——
 * 现实中通常只有二级部门（市场部/研发部）各自设上下班，行政部挂在集团下就用集团的。
 * 生效时段来自哪个部门会写进判定说明，避免"这条迟到是按哪个班算的"查不出来。
 */
import { db } from "./db.ts";
import crypto from "crypto";
import { type DbRow, asString } from "./sqliteUtil.ts";
import type { ShiftCandidate } from "./shiftMatch.ts";
import { formatWorkdays } from "./shiftMatch.ts";

/**
 * 列定义唯一在此（外键由 migrate 补，理由同 EMPLOYEE_COLUMNS：兜底建表发生在模块加载期，
 * 那一刻 departments 可能还不存在，带着 FK 的表会让本模块的写入直接抛错）。
 *
 * departmentId 必须有外键：规则是指向部门的「工作时段」，部门删掉之后它就无人可匹配，
 * 而 listRules 会给出 departmentName='' 的行；更要紧的是 resolveRulesForDepartment 按 id 查，
 * 幽灵规则既不会被命中也不会被清理，只在表里越积越多。
 */
export const DEPT_SHIFT_RULE_COLUMNS = `
    id           TEXT PRIMARY KEY,
    departmentId TEXT NOT NULL,
    name         TEXT NOT NULL,
    startTime    TEXT NOT NULL,
    endTime      TEXT NOT NULL,
    workdays     TEXT NOT NULL DEFAULT '1,2,3,4,5'
`;

/** 幂等建表；migrate 的 v14 重建会先 rename 再调它把表与索引建回来。 */
export function ensureShiftRulesTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dept_shift_rules (${DEPT_SHIFT_RULE_COLUMNS});
    CREATE INDEX IF NOT EXISTS idx_dept_shift_rules_department ON dept_shift_rules(departmentId);
  `);
}
ensureShiftRulesTable();

export interface DeptShiftRule {
  id: string;
  departmentId: string;
  departmentName: string;
  name: string;
  startTime: string;
  endTime: string;
  workdays: number[];
}

/** 沿部门树向上找到第一个配了时段的部门 */
export interface ResolvedRules {
  rules: DeptShiftRule[];
  /** 规则实际来源部门（继承时不同于员工部门）；一个都没找到时为 null */
  sourceDepartmentId: string | null;
  sourceDepartmentName: string;
  /** 往上跳了几级；0 = 就是员工自己的部门 */
  depth: number;
}

function parseWorkdays(raw: string): number[] {
  const list = String(raw || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  return [...new Set(list)].sort((a, b) => a - b);
}

function rowToRule(row: DbRow): DeptShiftRule {
  return {
    id: asString(row.id),
    departmentId: asString(row.departmentId),
    departmentName: asString(row.departmentName),
    name: asString(row.name),
    startTime: asString(row.startTime),
    endTime: asString(row.endTime),
    workdays: parseWorkdays(asString(row.workdays)),
  };
}

const RULE_SELECT = `
  SELECT r.*, COALESCE(d.name, '') AS departmentName
    FROM dept_shift_rules r
    LEFT JOIN departments d ON d.id = r.departmentId
`;

function departmentsAvailable(): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'departments'").get();
}

/**
 * 全量规则。departments 表缺席时（老库恢复 / 只 import 本模块的脚本）不联查，
 * 部门名回退成空串 —— 与 db.ts 的 accountsJoin 同一套降级口径。
 */
export function listDeptShiftRules(departmentId?: string): DeptShiftRule[] {
  const sql = departmentsAvailable()
    ? `${RULE_SELECT}${departmentId ? " WHERE r.departmentId = ?" : ""} ORDER BY COALESCE(d.name, ''), r.startTime`
    : `SELECT r.*, '' AS departmentName FROM dept_shift_rules r${departmentId ? " WHERE r.departmentId = ?" : ""} ORDER BY r.startTime`;
  const rows = departmentId
    ? (db.prepare(sql).all(departmentId) as unknown as DbRow[])
    : (db.prepare(sql).all() as unknown as DbRow[]);
  return rows.map(rowToRule);
}

export class ShiftRuleError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ShiftRuleError";
  }
}

function assertShape(input: { name: string; startTime: string; endTime: string; workdays: number[] }): void {
  if (!input.name.trim()) throw new ShiftRuleError("时段名称不能为空");
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) {
    throw new ShiftRuleError("上下班时间格式应为 HH:mm");
  }
  if (input.startTime === input.endTime) throw new ShiftRuleError("上班时间与下班时间相同，请填一天的两个时点");
  // endTime 早于 startTime 不再当错误：那是跨日班（16:00–00:00 的"24 点班"、20:00–04:00 的夜班）。
  // 三班倒的凌晨交接就落在这里 —— 界面按「次日」显示，判定按 shiftMatch.shiftWindow 加 1440 分钟。
  if (input.workdays.length === 0) throw new ShiftRuleError("至少选择一个工作日");
}

export function createDeptShiftRule(input: {
  departmentId: string;
  name: string;
  startTime: string;
  endTime: string;
  workdays: number[];
}): DeptShiftRule {
  assertShape(input);
  if (!departmentExists(input.departmentId)) throw new ShiftRuleError(`部门不存在：${input.departmentId}`);
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO dept_shift_rules (id, departmentId, name, startTime, endTime, workdays)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.departmentId, input.name.trim(), input.startTime, input.endTime, input.workdays.join(","));
  return listDeptShiftRules().find((r) => r.id === id)!;
}

export function updateDeptShiftRule(
  id: string,
  input: { name: string; startTime: string; endTime: string; workdays: number[]; departmentId?: string }
): DeptShiftRule | null {
  const existing = db.prepare("SELECT id, departmentId FROM dept_shift_rules WHERE id = ?").get(id) as DbRow | undefined;
  if (!existing) return null;
  assertShape(input);
  if (input.departmentId && !departmentExists(input.departmentId)) throw new ShiftRuleError(`部门不存在：${input.departmentId}`);
  const departmentId = input.departmentId ?? asString(existing.departmentId);
  db.prepare(
    `UPDATE dept_shift_rules SET departmentId = ?, name = ?, startTime = ?, endTime = ?, workdays = ? WHERE id = ?`
  ).run(departmentId, input.name.trim(), input.startTime, input.endTime, input.workdays.join(","), id);
  return listDeptShiftRules().find((r) => r.id === id) ?? null;
}

export function deleteDeptShiftRule(id: string): boolean {
  return db.prepare("DELETE FROM dept_shift_rules WHERE id = ?").run(id).changes > 0;
}

function departmentExists(id: string): boolean {
  if (!id) return false;
  if (!departmentsAvailable()) return false;
  return !!db.prepare("SELECT id FROM departments WHERE id = ?").get(id);
}

interface DeptNode {
  id: string;
  name: string;
  parentId: string | null;
}

function departmentNodes(): Map<string, DeptNode> {
  const map = new Map<string, DeptNode>();
  if (!departmentsAvailable()) return map;
  for (const row of db.prepare("SELECT id, name, parentId FROM departments").all() as unknown as DbRow[]) {
    map.set(asString(row.id), {
      id: asString(row.id),
      name: asString(row.name),
      parentId: row.parentId === null || row.parentId === undefined ? null : asString(row.parentId),
    });
  }
  return map;
}

/**
 * 员工部门 → 当天可选的时段候选集（含向上继承）。
 * 结果按"来源部门优先于祖先部门"排序，同部门内多条由 shiftMatch 按打卡时间挑。
 */
export function resolveRulesForDepartment(departmentId: string): ResolvedRules {
  const all = listDeptShiftRules();
  const byDept = new Map<string, DeptShiftRule[]>();
  for (const rule of all) {
    const bucket = byDept.get(rule.departmentId) ?? [];
    bucket.push(rule);
    byDept.set(rule.departmentId, bucket);
  }
  const nodes = departmentNodes();
  let cursor = departmentId ? (nodes.get(departmentId)?.id ?? departmentId) : "";
  let depth = 0;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const rules = byDept.get(cursor);
    if (rules && rules.length > 0) {
      return { rules, sourceDepartmentId: cursor, sourceDepartmentName: nodes.get(cursor)?.name ?? "", depth };
    }
    cursor = nodes.get(cursor)?.parentId ?? "";
    depth += 1;
  }
  return { rules: [], sourceDepartmentId: null, sourceDepartmentName: "", depth: 0 };
}

/** 转成 shiftMatch 的候选；label 带部门名，让异常说明能自证是按哪个班判的 */
export function toCandidates(resolved: ResolvedRules): ShiftCandidate[] {
  return resolved.rules.map((rule) => ({
    label: `${rule.departmentName || resolved.sourceDepartmentName || "部门"} · ${rule.name} ${rule.startTime}-${rule.endTime}`,
    sourceDepartment: rule.departmentName || resolved.sourceDepartmentName,
    name: rule.name,
    startTime: rule.startTime,
    endTime: rule.endTime,
    workdays: rule.workdays,
  }));
}

export function ruleSummary(rule: DeptShiftRule): string {
  return `${rule.name} ${rule.startTime}-${rule.endTime}（${formatWorkdays(rule.workdays)}）`;
}
