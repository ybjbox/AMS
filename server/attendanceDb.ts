/**
 * 考勤数据层 — shifts / schedules / punch_records / anomalies 四张表。
 * 异常分析为真实规则计算（不再返回硬编码结果）：
 *   迟到>15分钟 → LATE_15；迟到>5分钟 → LATE_5；
 *   当日仅一次打卡 → 按时间判定缺上班卡/缺下班卡；
 *   早退 → EARLY_LEAVE。
 */
import { db, transact } from "./db.ts";
import { getSetting, setSetting } from "./settingsDb.ts";
import crypto from "crypto";
import { resolvePaging, toListResult, ListResult } from "./listQuery.ts";
import { type DbRow, asString, asNumber, asNullableNumber, likeClause, likeContains } from "./sqliteUtil.ts";
import { resolveRulesForDepartment, toCandidates } from "./shiftRulesDb.ts";
import { candidateFromShift, resolveInstances, type ShiftCandidate } from "./shiftMatch.ts";

// ---------- 行类型（typescript-best-practices：边界解析） ----------
export interface ShiftRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleRow {
  employeeId: string;
  employeeName: string;
  shiftIds: string[];
  version: number;
}

export interface PunchRecordRow {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  version: number;
  /** 数据来源：'' = 手工/导入（历史行也是），'wecom' = 企业微信同步 */
  source: string;
}

export interface AnomalyRow {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: string;
  minutes: number | null;
  description: string;
}

function rowToShift(row: DbRow): ShiftRow {
  return {
    id: asString(row.id),
    name: asString(row.name),
    startTime: asString(row.startTime),
    endTime: asString(row.endTime),
  };
}

function rowToRecord(row: DbRow): PunchRecordRow {
  return {
    id: asString(row.id),
    employeeId: asString(row.employeeId),
    employeeName: asString(row.employeeName),
    date: asString(row.date),
    time: asString(row.time),
    version: asNumber(row.version),
    source: asString(row.source),
  };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS shifts (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schedules (
    employeeId   TEXT PRIMARY KEY,
    employeeName TEXT NOT NULL,
    shiftIds     TEXT DEFAULT '[]',
    version      INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS punch_records (
    id           TEXT PRIMARY KEY,
    employeeId   TEXT NOT NULL,
    employeeName TEXT NOT NULL,
    date         TEXT NOT NULL,
    time         TEXT NOT NULL,
    version      INTEGER DEFAULT 0,
    source       TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS anomalies (
    id           TEXT PRIMARY KEY,
    employeeId   TEXT NOT NULL,
    employeeName TEXT NOT NULL,
    date         TEXT NOT NULL,
    type         TEXT NOT NULL,
    minutes      INTEGER,
    description  TEXT DEFAULT ''
  );
`);

// ---------- 老库补列：source 是企微同步这一路才引入的，历史库没有这一列 ----------
/**
 * 幂等补 punch_records.source 列。
 * 不靠 SCHEMA_VERSION 抬版本：本模块加载即补，所以任何进程（含只 import 本模块的脚本、
 * 以及从旧备份恢复出来的库）在写企微数据前都一定拿得到这一列。migrate 的常驻步骤也调它，
 * 两条路都跑过仍是零操作。
 */
export function ensurePunchSourceColumns(): void {
  try {
    const cols = db.prepare("PRAGMA table_info(punch_records)").all() as unknown as DbRow[];
    if (cols.some((c) => asString(c.name) === "source")) return;
    db.exec("ALTER TABLE punch_records ADD COLUMN source TEXT NOT NULL DEFAULT ''");
  } catch (e) {
    // 表还不存在（建表由本模块或 migrate 负责）：忽略，下一次调用会补上
    console.warn("[attendance] 补 source 列失败：", e instanceof Error ? e.message : e);
  }
}
ensurePunchSourceColumns();

// ---------- Shifts ----------
export function listShifts(): ShiftRow[] {
  return db.prepare("SELECT * FROM shifts ORDER BY rowid").all().map(rowToShift);
}

export function createShift(input: { id?: string; name: string; startTime: string; endTime: string }): ShiftRow {
  const id = input.id || crypto.randomUUID();
  // 归一到 HH:mm：`9:00` 会让 shiftMatch 的 toMinutes 解析成 NaN，那条班次从此永不判迟到
  const startTime = normalizeClockTime(input.startTime);
  const endTime = normalizeClockTime(input.endTime);
  db.prepare("INSERT INTO shifts (id, name, startTime, endTime) VALUES (?, ?, ?, ?)").run(
    id, input.name, startTime, endTime
  );
  const row = db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
  if (!row) throw new Error(`createShift: 插入后未找到班次 ${id}`);
  return rowToShift(row);
}

export function updateShift(id: string, input: { name?: string; startTime?: string; endTime?: string }): ShiftRow | null {
  const existingRow = db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
  if (!existingRow) return null;
  const existing = rowToShift(existingRow);
  db.prepare("UPDATE shifts SET name = ?, startTime = ?, endTime = ? WHERE id = ?").run(
    input.name ?? existing.name,
    input.startTime !== undefined ? normalizeClockTime(input.startTime) : existing.startTime,
    input.endTime !== undefined ? normalizeClockTime(input.endTime) : existing.endTime,
    id
  );
  const row = db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
  return row ? rowToShift(row) : null;
}

/**
 * 删除班次。schedules.shiftIds 是一段 JSON 文本，SQLite 无法对它建外键，
 * 所以这里手工把该 id 从所有排班里摘掉 —— 否则排班会留下指向已删班次的幽灵 id：
 * 读侧一律是 `shiftIds.map(id => shiftMap.get(id)).find(Boolean)`，
 * 于是被删的那个 id 会让「当天实际班次」静默变成同一条里的下一个，考勤结果错得看不见。
 */
export function deleteShift(id: string): boolean {
  return transact(() => {
    const removed = db.prepare("DELETE FROM shifts WHERE id = ?").run(id).changes > 0;
    if (!removed) return false;
    let stripped = 0;
    for (const row of db.prepare("SELECT employeeId, shiftIds, version FROM schedules").all() as DbRow[]) {
      const ids = parseShiftIds(asString(row.shiftIds));
      if (!ids.includes(id)) continue;
      const next = ids.filter((x) => x !== id);
      db.prepare(
        `UPDATE schedules SET shiftIds = ?, version = version + 1 WHERE employeeId = ?`
      ).run(JSON.stringify(next), asString(row.employeeId));
      stripped++;
    }
    if (stripped > 0) console.log(`[attendance] 删除班次 ${id}：已从 ${stripped} 条排班中摘掉该班次`);
    return true;
  });
}

// ---------- Schedules ----------
function rowToSchedule(row: DbRow): ScheduleRow {
  return {
    employeeId: asString(row.employeeId),
    employeeName: asString(row.employeeName),
    shiftIds: parseShiftIds(asString(row.shiftIds)),
    version: asNumber(row.version),
  };
}

function parseShiftIds(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function listSchedules(): ScheduleRow[] {
  return db.prepare("SELECT * FROM schedules ORDER BY rowid").all().map(rowToSchedule);
}

/**
 * 整表替换（用于批量改/导入场景）。改为 upsert-only：不再 DELETE ALL，
 * 未出现在请求中的行保持不变，从而避免并发编辑时「后提交者删掉他人新增」的丢数据问题。
 * 单条增删请走 upsertSchedule / deleteSchedule。
 */
export function replaceSchedules(schedules: { employeeId: string; employeeName: string; shiftIds?: string[] }[]): ScheduleRow[] {
  const upsert = db.prepare(
    `INSERT INTO schedules (employeeId, employeeName, shiftIds, version)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(employeeId) DO UPDATE SET
       employeeName = excluded.employeeName,
       shiftIds = excluded.shiftIds,
       version = version + 1`
  );
  db.exec("BEGIN");
  try {
    for (const s of schedules || []) {
      upsert.run(s.employeeId, s.employeeName, JSON.stringify(s.shiftIds || []));
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return listSchedules();
}

/** 增量：新增或更新单个员工排班（按 employeeId 幂等 upsert，version 自增） */
/** 乐观锁冲突：客户端携带的 expectedVersion 与库内当前版本不一致 */
export class VersionConflictError extends Error {
  constructor() {
    super("数据已被他人修改，请刷新后重试");
    this.name = "VersionConflictError";
  }
}

/** 日期/时间格式不合法（这类值会静默逃过范围查询，或被唯一键当成另一分钟） */
export class PunchFormatError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PunchFormatError";
  }
}

/**
 * 打卡日期归一：接受 2026-09-21 / 2026-9-21 / 2026/9/21，一律存成 YYYY-MM-DD。
 * 必须归一：punch_records 的范围查询是按 TEXT 字典序比的（`date >= ?`），
 * 存了 2026-9-21 就永远查不到， yet 它在库里看着完全正常。
 */
export function normalizePunchDate(value: unknown): string {
  // 原文回显进 400 响应体，必须先截断：这条路由的 body 上限是 20MB，
  // 不截断的话一个坏日期就能让服务端把上百万字原样吐回调用方。
  const raw = String(value ?? "").trim().slice(0, 40);
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/u.exec(raw);
  if (!m) throw new PunchFormatError(`打卡日期格式不正确（需要 YYYY-MM-DD）：${raw || "空值"}`);
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new PunchFormatError(`打卡日期不合法：${raw}`);
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 打卡时间归一：9:00 / 09:00 / 09:00:00 → 09:00:00。
 * 关键是补零到两位：唯一键是 (employeeId,date,time) 三列，
 * "9:00" 与 "09:00" 会被认成两个不同分钟，同一分钟就会落两条卡（月报与缺卡判定跟着错）。
 */
export function normalizePunchTime(value: unknown): string {
  const raw = String(value ?? "").trim().slice(0, 40); // 同 normalizePunchDate：坏值会被原样回显
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/u.exec(raw);
  if (!m) throw new PunchFormatError(`打卡时间格式不正确（需要 HH:mm 或 HH:mm:ss）：${raw || "空值"}`);
  const [, h, mi, s] = m;
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new PunchFormatError(`打卡时间不合法：${raw}`);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

/** 班次/时段的时间存 HH:mm（shiftMatch 按 HH:mm 解析，多余秒数会被忽略，先统一掉） */
export function normalizeClockTime(value: unknown): string {
  return normalizePunchTime(value).slice(0, 5);
}

/**
 * 增量：新增或更新单个员工排班（按 employeeId 幂等 upsert，version 自增）。
 * 传入 expectedVersion 时启用乐观锁：库内版本不一致则抛 VersionConflictError（路由层转 409），
 * 防止「后提交者覆盖前提交者」的并发丢改。
 */
export function upsertSchedule(s: {
  employeeId: string;
  employeeName: string;
  shiftIds?: string[];
  expectedVersion?: number;
}): ScheduleRow {
  const existingRow = db
    .prepare("SELECT version FROM schedules WHERE employeeId = ?")
    .get(s.employeeId);
  const existingVersion = existingRow ? asNumber(existingRow.version) : undefined;

  if (existingVersion !== undefined) {
    if (s.expectedVersion !== undefined && s.expectedVersion !== existingVersion) {
      throw new VersionConflictError();
    }
    db.prepare(
      `UPDATE schedules SET employeeName = ?, shiftIds = ?, version = version + 1
       WHERE employeeId = ?`
    ).run(s.employeeName, JSON.stringify(s.shiftIds || []), s.employeeId);
  } else {
    db.prepare(
      `INSERT INTO schedules (employeeId, employeeName, shiftIds, version) VALUES (?, ?, ?, 1)`
    ).run(s.employeeId, s.employeeName, JSON.stringify(s.shiftIds || []));
  }
  const row = db.prepare("SELECT * FROM schedules WHERE employeeId = ?").get(s.employeeId);
  if (!row) throw new Error(`upsertSchedule: upsert 后未找到排班 ${s.employeeId}`);
  return rowToSchedule(row);
}

/** 增量：删除单个员工排班 */
export function deleteSchedule(employeeId: string) {
  return db.prepare("DELETE FROM schedules WHERE employeeId = ?").run(employeeId).changes > 0;
}

/** 增量：清空所有排班 */
export function clearSchedules() {
  db.exec("DELETE FROM schedules");
}

// ---------- Punch Records ----------
export function listRecords(query: Record<string, unknown> = {}): PunchRecordRow[] | ListResult<PunchRecordRow> {
  const paging = resolvePaging(query);

  const clauses: string[] = [];
  const params: string[] = [];
  if (typeof query.employeeId === "string" && query.employeeId) {
    clauses.push("employeeId = ?");
    params.push(query.employeeId);
  }
  if (typeof query.employeeName === "string" && query.employeeName) {
    clauses.push(likeClause("employeeName"));
    params.push(likeContains(query.employeeName));
  }
  if (typeof query.dateFrom === "string" && query.dateFrom) {
    clauses.push("date >= ?");
    params.push(query.dateFrom);
  }
  if (typeof query.dateTo === "string" && query.dateTo) {
    clauses.push("date <= ?");
    params.push(query.dateTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = asNumber(db.prepare(`SELECT COUNT(*) AS c FROM punch_records ${where}`).get(...params)?.c);

  if (!paging.requested) {
    // 向后兼容：未请求分页时返回完整数组
    const rows = db.prepare(`SELECT * FROM punch_records ${where} ORDER BY date, time`).all(...params);
    return rows.map(rowToRecord);
  }

  const rows = db
    .prepare(`SELECT * FROM punch_records ${where} ORDER BY date, time LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset);
  return toListResult(rows.map(rowToRecord), total, paging);
}

/**
 * 批量写入（Excel 导入语义）：按 (employeeId, date, time) 幂等 upsert，
 * **只加不减** —— 未出现在本次清单里的记录保持原样。
 *
 * 这里原先是 `DELETE FROM punch_records` 再整体插入。那个语义配合默认写策略（HR+）
 * 等于「任何 HR 提交一行就清空全库打卡记录」，而整表清空本有 DELETE /records
 * （仅 ADMIN，且界面单独确认）这条带门槛的路。破坏性动作必须走它自己的门，
 * 不能由导入语义顺带触发 —— 与 replaceSchedules 的 upsert-only 口径一致。
 */
export function upsertRecords(records: { id?: string; employeeId: string; employeeName: string; date: string; time: string }[]): PunchRecordRow[] | ListResult<PunchRecordRow> {
  const insert = db.prepare(
    `INSERT INTO punch_records (id, employeeId, employeeName, date, time, version) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(employeeId, date, time) DO NOTHING`
  );
  db.exec("BEGIN");
  try {
    for (const r of records || []) {
      insert.run(
        r.id || crypto.randomUUID(),
        r.employeeId,
        r.employeeName,
        normalizePunchDate(r.date),
        normalizePunchTime(r.time)
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return listRecords();
}

/** 增量：新增或更新单条打卡记录（按 id 幂等 upsert，version 自增） */
/** 增量：新增或更新单条打卡记录（id 缺省自动生成；expectedVersion 启用乐观锁，见 upsertSchedule） */
/** 同人同日同时刻已有记录：唯一索引 (employeeId,date,time) 命中，由路由翻成 400 而非 500 */
export class DuplicatePunchError extends Error {
  constructor() {
    super("该员工在这一分钟已有打卡记录");
    this.name = "DuplicatePunchError";
  }
}

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE constraint failed|CONSTRAINT_UNIQUE/i.test(msg);
}

export function upsertRecord(r: {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  expectedVersion?: number;
}): PunchRecordRow {
  const id = r.id ?? crypto.randomUUID();
  const date = normalizePunchDate(r.date);
  const time = normalizePunchTime(r.time);
  const existingRow = db.prepare("SELECT version FROM punch_records WHERE id = ?").get(id) as
    | { version: number | bigint }
    | undefined;

  if (existingRow) {
    const existingVersion = Number(existingRow.version);
    if (r.expectedVersion !== undefined && r.expectedVersion !== existingVersion) {
      throw new VersionConflictError();
    }
    try {
      db.prepare(
        `UPDATE punch_records SET employeeId = ?, employeeName = ?, date = ?, time = ?, version = version + 1
         WHERE id = ?`
      ).run(r.employeeId, r.employeeName, date, time, id);
    } catch (e) {
      // 把这条记录改到与另一条同一分钟
      if (isUniqueViolation(e)) throw new DuplicatePunchError();
      throw e;
    }
  } else {
    // 无 id 即"记一笔打卡"：同一分钟重复提交必须落到同一行（补卡审批重跑、导入重跑都靠这条）
    const res = db
      .prepare(
        `INSERT INTO punch_records (id, employeeId, employeeName, date, time, version) VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(employeeId, date, time) DO NOTHING`
      )
      .run(id, r.employeeId, r.employeeName, date, time);
    if (res.changes === 0) {
      const hit = db
        .prepare("SELECT * FROM punch_records WHERE employeeId = ? AND date = ? AND time = ?")
        .get(r.employeeId, date, time) as DbRow | undefined;
      if (hit) return rowToRecord(hit);
      throw new DuplicatePunchError();
    }
  }
  const row = db.prepare("SELECT * FROM punch_records WHERE id = ?").get(id);
  if (!row) throw new Error(`upsertRecord: upsert 后未找到打卡记录 ${id}`);
  return rowToRecord(row as unknown as DbRow);
}

/** 增量：删除单条打卡记录 */
export function deleteRecord(id: string) {
  return db.prepare("DELETE FROM punch_records WHERE id = ?").run(id).changes > 0;
}

/** 增量：清空所有打卡记录 */
export function clearRecords() {
  db.exec("DELETE FROM punch_records");
}

/**
 * 外部数据源增量写入（企业微信同步通道）。
 *
 * 与 upsertRecords 的区别：那条服务于 Excel 导入（同一分钟已有行则跳过），
 * 这里只加、不改、不删。
 * (employeeId,date,time) 唯一索引命中即跳过，所以同一区间重复同步是幂等的，
 * 而 HR 手工补的卡与 Excel 导入的行都不会被同步冲掉。
 */
export function insertSourcedRecords(
  rows: { employeeId: string; employeeName: string; date: string; time: string; source: string }[]
): { created: number; skipped: number } {
  const insert = db.prepare(
    `INSERT INTO punch_records (id, employeeId, employeeName, date, time, version, source)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(employeeId, date, time) DO NOTHING`
  );
  let created = 0;
  let skipped = 0;
  // 先整体归一再开事务：任何一行日期/时间格式不对就整体拒绝，不留"半批已写入"的状态
  const normalized = rows.map((r) => ({
    ...r,
    date: normalizePunchDate(r.date),
    time: normalizePunchTime(r.time),
  }));
  db.exec("BEGIN");
  try {
    for (const r of normalized) {
      const res = insert.run(crypto.randomUUID(), r.employeeId, r.employeeName, r.date, r.time, r.source);
      if (Number(res.changes) > 0) created += 1;
      else skipped += 1;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { created, skipped };
}

/** 某来源已有的打卡行数（同步结果面板用来核对"库里到底有多少条企微卡"） */
export function countRecordsBySource(source: string): number {
  return asNumber(db.prepare("SELECT COUNT(*) AS c FROM punch_records WHERE source = ?").get(source)?.c);
}

// ---------- Anomalies ----------
export function listAnomalies(): AnomalyRow[] {
  return db.prepare("SELECT * FROM anomalies ORDER BY date, employeeId").all().map((row) => ({
    id: asString(row.id),
    employeeId: asString(row.employeeId),
    employeeName: asString(row.employeeName),
    date: asString(row.date),
    type: asString(row.type),
    minutes: asNullableNumber(row.minutes),
    description: asString(row.description),
  }));
}

// ---------- 对班解析（异常分析与月报共用同一份口径） ----------

export type ShiftSourceKind = "rule" | "schedule" | "none";

export interface EmployeeShiftPlan {
  candidates: ShiftCandidate[];
  /** rule = 按部门工作时段自动对班；schedule = 回退到逐日排班；none = 两者都没有 */
  source: ShiftSourceKind;
  /** 给人看的来源说明，如「研发部（继承自集团总部）」「正常班（排班）」 */
  note: string;
}

/**
 * 一次性把「员工 → 当天可选班次」解析好并缓存。
 *
 * 优先级是刻意的：**部门时段一旦配了就覆盖该部门（含继承的子部门）员工的全部判定**，
 * 因为用户给的是「各部门上班时间段」而不是逐日排班表；两套并存时若让排班优先，
 * HR 改了时段却看不到效果，只会更困惑。回退到排班是为了不让没配时段的部门失去判定。
 */
export function buildShiftPlanner(): (employeeId: string) => EmployeeShiftPlan {
  const shiftMap = new Map(listShifts().map((s) => [s.id, s]));
  const scheduleMap = new Map(listSchedules().map((s) => [s.employeeId, s]));
  const deptByEmployee = new Map<string, string>();
  try {
    for (const row of db.prepare("SELECT id, departmentId FROM employees").all() as unknown as DbRow[]) {
      deptByEmployee.set(asString(row.id), asString(row.departmentId));
    }
  } catch {
    /* employees 表缺席时按"没有部门"处理：员工会退回排班口径而不是整个分析炸掉 */
  }
  const cache = new Map<string, EmployeeShiftPlan>();

  const compute = (employeeId: string): EmployeeShiftPlan => {
    const resolved = resolveRulesForDepartment(deptByEmployee.get(employeeId) ?? "");
    if (resolved.rules.length > 0) {
      const via = resolved.depth > 0 ? `（继承自 ${resolved.sourceDepartmentName}）` : "";
      return { candidates: toCandidates(resolved), source: "rule", note: `${resolved.sourceDepartmentName}${via}` };
    }
    const schedule = scheduleMap.get(employeeId);
    const shift = schedule ? schedule.shiftIds.map((id) => shiftMap.get(id)).find(Boolean) : undefined;
    if (shift) return { candidates: [candidateFromShift(shift)], source: "schedule", note: `${shift.name}（排班）` };
    return {
      candidates: [],
      source: "none",
      note: schedule ? "排班指向的班次已不存在" : "既没有部门时段也没有排班",
    };
  };

  return (employeeId) => {
    const hit = cache.get(employeeId);
    if (hit) return hit;
    const plan = compute(employeeId);
    cache.set(employeeId, plan);
    return plan;
  };
}

/** 分析覆盖率：让用户看见"有多少人日根本没被判定"，而不是以为系统算过了 */
export interface AnalyzeCoverage {
  /** 有打卡的「员工×日历日」数（对账用；判定不按日历日，见 instances） */
  days: number;
  /** 切出来的班次实例数 —— 三班倒下一个实例可跨两个日历日，判定按实例走 */
  instances: number;
  byRule: number;
  bySchedule: number;
  /** 配了时段/排班但对不上班（首卡偏差超容忍 / 非工作日）的实例锚点 */
  unmatched: number;
  /** 既没部门时段也没排班，完全无从判定的人日 */
  noPlan: number;
  leaveSkipped: number;
  unmatchedSample: { employeeId: string; employeeName: string; date: string; reason: string }[];
}

export interface AnalyzeResult {
  anomalies: AnomalyRow[];
  coverage: AnalyzeCoverage;
}

// ---------- 月度考勤汇总（P0：HR 月报） ----------

export interface MonthlySummaryRow {
  employeeId: string;
  employeeName: string;
  department: string;
  /** 出勤天数（当月有打卡记录的天数） */
  workDays: number;
  /** 打卡总次数 */
  punchCount: number;
  /** 迟到次数（与异常规则一致：首卡晚于班次开始 +5 分钟以上） */
  lateCount: number;
  /** 早退次数（末卡早于班次结束） */
  earlyLeaveCount: number;
  /** 缺卡次数（单次打卡的日期数） */
  missingCount: number;
}

/**
 * 月度考勤汇总：按 员工 聚合当月打卡数据，套用与异常分析一致的规则。
 * 直接实时计算（不依赖 anomalies 表），保证报表始终是最新口径。
 */
export function monthlySummary(month: string): MonthlySummaryRow[] {
  const prefix = `${month}-%`;
  const planner = buildShiftPlanner();

  // 当月打卡记录（含部门联查）
  const rows = db
    .prepare(
      `SELECT p.employeeId AS employeeId, p.employeeName AS employeeName, p.date AS date, p.time AS time,
              COALESCE(d.name, NULLIF(e.department, ''), '') AS department
         FROM punch_records p
         LEFT JOIN employees e ON e.id = p.employeeId
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE p.date LIKE ?`
    )
    .all(prefix);

  // 按员工分组：三班倒的班次实例会跨零点（24 点班的下班卡打在次日 00:03），
  // 所以判定不能按日历日切 —— 见 shiftMatch.buildShiftInstances。
  const perEmployee = new Map<
    string,
    { employeeName: string; department: string; punches: { date: string; time: string }[] }
  >();
  for (const r of rows) {
    const employeeId = asString(r.employeeId);
    if (!perEmployee.has(employeeId)) {
      perEmployee.set(employeeId, {
        employeeName: asString(r.employeeName),
        department: asString(r.department),
        punches: [],
      });
    }
    perEmployee.get(employeeId)!.punches.push({ date: asString(r.date), time: asString(r.time).slice(0, 5) });
  }

  const leaveDays = approvedLeaveDayKeys();
  const summaryRows: MonthlySummaryRow[] = [];
  for (const [employeeId, info] of perEmployee) {
    const agg: MonthlySummaryRow = {
      employeeId,
      employeeName: info.employeeName,
      department: info.department,
      // 出勤天数与打卡次数仍按"有卡的日历日"计（与历史口径一致），只有判定改成班次实例
      workDays: new Set(info.punches.map((p) => p.date)).size,
      punchCount: info.punches.length,
      lateCount: 0,
      earlyLeaveCount: 0,
      missingCount: 0,
    };
    const plan = planner(employeeId);
    if (plan.source !== "none") {
      for (const outcome of resolveInstances(plan.candidates, info.punches)) {
        if (outcome.kind !== "judged") continue;
        // 已批准请假日不判（半天请假只有一次打卡会被误标缺卡），与异常分析同口径
        if (leaveDays.has(`${employeeId}__${outcome.date}`)) continue;
        for (const finding of outcome.judgement.findings) {
          if (finding.type === "LATE_5" || finding.type === "LATE_15") agg.lateCount += 1;
          else if (finding.type === "EARLY_LEAVE") agg.earlyLeaveCount += 1;
          else agg.missingCount += 1;
        }
      }
    }
    summaryRows.push(agg);
  }

  return summaryRows.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

/**
 * 已批准请假覆盖的「员工__日期」集合（账号未关联员工档案的申请无法映射，跳过）。
 * 请假当天不再判定考勤异常——否则半天请假只有一次打卡会被误标「缺卡」并通知员工。
 * approvals 表由 approvalsDb 模块加载时建表；部分测试场景可能未加载，try/catch 视为无请假。
 */
function approvedLeaveDayKeys(): Set<string> {
  const keys = new Set<string>();
  try {
    const rows = db
      .prepare(
        `SELECT a.employeeId AS employeeId, ap.startDate AS startDate, ap.endDate AS endDate
           FROM approvals ap
           JOIN accounts a ON a.username = ap.applicant
          WHERE ap.status = 'approved' AND ap.type = 'leave'
            AND a.employeeId IS NOT NULL AND a.employeeId != ''`
      )
      .all() as { employeeId: string; startDate: string; endDate: string | null }[];
    for (const r of rows) {
      const start = Date.parse(`${asString(r.startDate)}T00:00:00Z`);
      if (Number.isNaN(start)) continue;
      const endRaw = r.endDate ? Date.parse(`${asString(r.endDate)}T00:00:00Z`) : start;
      const end = Number.isNaN(endRaw) ? start : endRaw;
      // 上限 366 天：防脏数据（超大区间日期）拖垮分析
      const capped = Math.min(end, start + 366 * 86_400_000);
      // 起止日期按 UTC 解析、再按 UTC 渲染回日期串：两端同域，所以"哪天"与输入完全一致。
      // 这里刻意不用本地口径（改成 localToday 反而会让 +8h 的机器上少一天）。
      for (let t = start; t <= capped; t += 86_400_000) {
        keys.add(`${asString(r.employeeId)}__${new Date(t).toISOString().slice(0, 10)}`);
      }
    }
  } catch {
    /* approvals/accounts 表不存在时按无请假处理 */
  }
  return keys;
}

/**
 * 真实异常分析：打卡记录 → 自动对班（部门工作时段，回退逐日排班）→ 判定，结果持久化。
 * 返回 anomalies + coverage：对不上班的人日**不判定**，但必须报出来，
 * 否则"今天没人迟到"和"今天没一个人对上班"在界面上会长得一模一样。
 */
export function analyzeAttendance(): AnalyzeResult {
  const recordsResult = listRecords();
  const records = Array.isArray(recordsResult) ? recordsResult : recordsResult.items;
  const leaveDays = approvedLeaveDayKeys();
  const planner = buildShiftPlanner();

  // 按员工分组（判定单位是班次实例，可能跨零点；这里仍统计"人·日历日"用于对账）
  const grouped = new Map<string, PunchRecordRow[]>();
  const personDays = new Set<string>();
  for (const r of records) {
    personDays.add(`${r.employeeId}__${r.date}`);
    const key = r.employeeId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const coverage: AnalyzeCoverage = {
    days: personDays.size,
    instances: 0,
    byRule: 0,
    bySchedule: 0,
    unmatched: 0,
    noPlan: 0,
    leaveSkipped: 0,
    unmatchedSample: [],
  };
  const unmatchedDays = new Map<string, { employeeId: string; employeeName: string; date: string; reason: string }>();
  const noPlanDays = new Map<string, { employeeId: string; employeeName: string; date: string; reason: string }>();
  const anomalies: {
    employeeId: string;
    employeeName: string;
    date: string;
    type: string;
    minutes?: number;
    description: string;
  }[] = [];

  for (const [employeeId, punches] of grouped) {
    const employeeName = punches[0].employeeName;
    const plan = planner(employeeId);
    if (plan.source === "none") {
      const days = new Set(punches.map((p) => p.date));
      coverage.noPlan += days.size;
      for (const date of days) {
        noPlanDays.set(`${employeeId}__${date}`, {
          employeeId,
          employeeName,
          date,
          reason: `无判定依据：${plan.note}`,
        });
      }
      continue;
    }
    for (const outcome of resolveInstances(
      plan.candidates,
      punches.map((p) => ({ date: p.date, time: p.time }))
    )) {
      if (leaveDays.has(`${employeeId}__${outcome.date}`)) {
        coverage.leaveSkipped += 1;
        continue;
      }
      if (outcome.kind === "unmatched") {
        // 按「人·日」去重统计：一个日历日里可能有两个对不上的锚点，界面只关心"哪天没判"
        const dayKey = `${employeeId}__${outcome.date}`;
        if (!unmatchedDays.has(dayKey)) {
          unmatchedDays.set(dayKey, { employeeId, employeeName, date: outcome.date, reason: outcome.reason });
        }
        continue;
      }
      coverage.instances += 1;
      if (plan.source === "rule") coverage.byRule += 1;
      else coverage.bySchedule += 1;
      for (const finding of outcome.judgement.findings) {
        anomalies.push({
          employeeId,
          employeeName,
          date: outcome.date,
          type: finding.type,
          minutes: finding.minutes ?? undefined,
          description: finding.description,
        });
      }
    }
  }

  coverage.unmatched = unmatchedDays.size;
  coverage.unmatchedSample = [...unmatchedDays.values(), ...noPlanDays.values()].slice(0, 20);

  // 持久化分析结果（整表替换包在事务里，避免中途失败丢失全部历史异常；
  // transact 可重入——被审批决定的外层事务调用时自动并入，不再嵌套 BEGIN）
  const insert = db.prepare(
    "INSERT INTO anomalies (id, employeeId, employeeName, date, type, minutes, description) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  transact(() => {
    db.exec("DELETE FROM anomalies");
    for (const a of anomalies) {
      insert.run(crypto.randomUUID(), a.employeeId, a.employeeName, a.date, a.type, a.minutes ?? null, a.description);
    }
  });
  // 覆盖率跟着结果一起留档：刷新页面或换一台设备也要能看到"为什么没有异常"，
  // 而不是只剩一个空列表让人以为系统已经判过了。
  const result: AnalyzeResult = { anomalies: listAnomalies(), coverage };
  setAttendanceAnalysisStatus(result);
  return result;
}

const ANALYSIS_STATUS_KEY = "attendance_last_analysis";

/** 上一次分析的覆盖统计（重启/刷新后仍可用） */
export function getAttendanceAnalysisStatus(): { at: string | null; coverage: AnalyzeCoverage | null } {
  const raw = getSetting<{ at?: string; coverage?: AnalyzeCoverage }>(ANALYSIS_STATUS_KEY);
  return { at: typeof raw?.at === "string" ? raw.at : null, coverage: raw?.coverage ?? null };
}

function setAttendanceAnalysisStatus(result: AnalyzeResult): void {
  try {
    setSetting(ANALYSIS_STATUS_KEY, { at: new Date().toISOString(), coverage: result.coverage });
  } catch {
    /* 留档失败不影响分析结果本身 */
  }
}

/** 兼容旧调用方（审批决定后只关心"重算一遍"）：只要异常列表时用它 */
export function analyzeAnomalies(): AnomalyRow[] {
  return analyzeAttendance().anomalies;
}

// ---------- 首次播种（默认班次，与原 mock 一致） ----------
(function seedShiftsIfEmpty() {
  const count = asNumber(db.prepare("SELECT COUNT(*) AS c FROM shifts").get()?.c);
  if (count > 0) return;
  db.prepare("INSERT INTO shifts (id, name, startTime, endTime) VALUES (?, ?, ?, ?)").run(
    "1", "正常班", "09:00", "18:00"
  );
  console.log("[db] Seeded default shift into SQLite");
})();
