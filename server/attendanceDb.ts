/**
 * 考勤数据层 — shifts / schedules / punch_records / anomalies 四张表。
 * 异常分析为真实规则计算（不再返回硬编码结果）：
 *   迟到>15分钟 → LATE_15；迟到>5分钟 → LATE_5；
 *   当日仅一次打卡 → 按时间判定缺上班卡/缺下班卡；
 *   早退 → EARLY_LEAVE。
 */
import { db } from "./db.ts";
import crypto from "crypto";
import { resolvePaging, toListResult, ListResult } from "./listQuery.ts";
import { type DbRow, asString, asNumber, asNullableNumber } from "./sqliteUtil.ts";

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
    version      INTEGER DEFAULT 0
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

// ---------- Shifts ----------
export function listShifts(): ShiftRow[] {
  return db.prepare("SELECT * FROM shifts ORDER BY rowid").all().map(rowToShift);
}

export function createShift(input: { id?: string; name: string; startTime: string; endTime: string }): ShiftRow {
  const id = input.id || crypto.randomUUID();
  db.prepare("INSERT INTO shifts (id, name, startTime, endTime) VALUES (?, ?, ?, ?)").run(
    id, input.name, input.startTime, input.endTime
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
    input.startTime ?? existing.startTime,
    input.endTime ?? existing.endTime,
    id
  );
  const row = db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
  return row ? rowToShift(row) : null;
}

export function deleteShift(id: string) {
  return db.prepare("DELETE FROM shifts WHERE id = ?").run(id).changes > 0;
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
    clauses.push("employeeName LIKE ?");
    params.push(`%${query.employeeName}%`);
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
 * 整表替换（Excel 导入语义）：清空后整体写入。保留该语义（导入即全量覆盖），
 * 但用事务包裹，避免中途失败留下半截数据。
 */
export function replaceRecords(records: { id?: string; employeeId: string; employeeName: string; date: string; time: string }[]): PunchRecordRow[] | ListResult<PunchRecordRow> {
  const insert = db.prepare(
    "INSERT INTO punch_records (id, employeeId, employeeName, date, time, version) VALUES (?, ?, ?, ?, ?, 1)"
  );
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM punch_records");
    for (const r of records || []) {
      insert.run(r.id || crypto.randomUUID(), r.employeeId, r.employeeName, r.date, r.time);
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
export function upsertRecord(r: {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  expectedVersion?: number;
}): PunchRecordRow {
  const id = r.id ?? crypto.randomUUID();
  const existingRow = db
    .prepare("SELECT version FROM punch_records WHERE id = ?")
    .get(id);
  const existingVersion = existingRow ? asNumber(existingRow.version) : undefined;

  if (existingVersion !== undefined) {
    if (r.expectedVersion !== undefined && r.expectedVersion !== existingVersion) {
      throw new VersionConflictError();
    }
    db.prepare(
      `UPDATE punch_records SET employeeId = ?, employeeName = ?, date = ?, time = ?, version = version + 1
       WHERE id = ?`
    ).run(r.employeeId, r.employeeName, r.date, r.time, id);
  } else {
    db.prepare(
      `INSERT INTO punch_records (id, employeeId, employeeName, date, time, version) VALUES (?, ?, ?, ?, ?, 1)`
    ).run(id, r.employeeId, r.employeeName, r.date, r.time);
  }
  const row = db.prepare("SELECT * FROM punch_records WHERE id = ?").get(id);
  if (!row) throw new Error(`upsertRecord: upsert 后未找到打卡记录 ${id}`);
  return rowToRecord(row);
}

/** 增量：删除单条打卡记录 */
export function deleteRecord(id: string) {
  return db.prepare("DELETE FROM punch_records WHERE id = ?").run(id).changes > 0;
}

/** 增量：清空所有打卡记录 */
export function clearRecords() {
  db.exec("DELETE FROM punch_records");
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

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 真实异常分析：基于打卡记录 + 排班 + 班次时间计算，结果持久化 */
export function analyzeAnomalies(): AnomalyRow[] {
  const shifts = listShifts();
  const schedules = listSchedules();
  const recordsResult = listRecords();
  const records = Array.isArray(recordsResult) ? recordsResult : recordsResult.items;

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const scheduleMap = new Map(schedules.map((s) => [s.employeeId, s]));

  // 按 员工+日期 分组打卡
  const grouped = new Map<string, PunchRecordRow[]>();
  for (const r of records) {
    const key = `${r.employeeId}__${r.date}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const anomalies: { employeeId: string; employeeName: string; date: string; type: string; minutes?: number; description: string }[] = [];
  for (const [key, punches] of grouped) {
    const [employeeId, date] = key.split("__");
    const schedule = scheduleMap.get(employeeId);
    if (!schedule) continue; // 未排班员工不参与分析
    const shift = (schedule.shiftIds as string[]).map((id) => shiftMap.get(id)).find(Boolean);
    if (!shift) continue;

    const employeeName = punches[0].employeeName;
    const times = punches.map((p) => p.time.slice(0, 5)).sort();
    const shiftStart = toMinutes(shift.startTime);
    const shiftEnd = toMinutes(shift.endTime);
    const midpoint = (shiftStart + shiftEnd) / 2;

    if (times.length === 1) {
      // 仅一次打卡：按时间判定缺上班卡还是缺下班卡
      const t = toMinutes(times[0]);
      if (t <= midpoint) {
        anomalies.push({ employeeId, employeeName, date, type: "MISSING_OUT", description: "缺下班卡" });
      } else {
        anomalies.push({ employeeId, employeeName, date, type: "MISSING_IN", description: "缺上班卡" });
      }
      continue;
    }

    const inTime = toMinutes(times[0]);
    const outTime = toMinutes(times[times.length - 1]);

    const lateMinutes = inTime - shiftStart;
    if (lateMinutes > 15) {
      anomalies.push({ employeeId, employeeName, date, type: "LATE_15", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟` });
    } else if (lateMinutes > 5) {
      anomalies.push({ employeeId, employeeName, date, type: "LATE_5", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟` });
    }

    const earlyMinutes = shiftEnd - outTime;
    if (earlyMinutes > 0) {
      anomalies.push({ employeeId, employeeName, date, type: "EARLY_LEAVE", minutes: earlyMinutes, description: `早退 ${earlyMinutes} 分钟` });
    }
  }

  // 持久化分析结果（整表替换包在事务里，避免中途失败丢失全部历史异常）
  const insert = db.prepare(
    "INSERT INTO anomalies (id, employeeId, employeeName, date, type, minutes, description) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM anomalies");
    for (const a of anomalies) {
      insert.run(crypto.randomUUID(), a.employeeId, a.employeeName, a.date, a.type, a.minutes ?? null, a.description);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return listAnomalies();
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
