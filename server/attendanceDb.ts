/**
 * 考勤数据层 — shifts / schedules / punch_records / anomalies 四张表。
 * 异常分析为真实规则计算（不再返回硬编码结果）：
 *   迟到>15分钟 → LATE_15；迟到>5分钟 → LATE_5；
 *   当日仅一次打卡 → 按时间判定缺上班卡/缺下班卡；
 *   早退 → EARLY_LEAVE。
 */
import { db } from "./db.ts";
import crypto from "crypto";
import { resolvePaging, toListResult } from "./listQuery.ts";

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
export function listShifts() {
  return db.prepare("SELECT * FROM shifts ORDER BY rowid").all();
}

export function createShift(input: { id?: string; name: string; startTime: string; endTime: string }) {
  const id = input.id || crypto.randomUUID();
  db.prepare("INSERT INTO shifts (id, name, startTime, endTime) VALUES (?, ?, ?, ?)").run(
    id, input.name, input.startTime, input.endTime
  );
  return db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
}

export function updateShift(id: string, input: Record<string, any>) {
  const existing: any = db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare("UPDATE shifts SET name = ?, startTime = ?, endTime = ? WHERE id = ?").run(
    input.name ?? existing.name,
    input.startTime ?? existing.startTime,
    input.endTime ?? existing.endTime,
    id
  );
  return db.prepare("SELECT * FROM shifts WHERE id = ?").get(id);
}

export function deleteShift(id: string) {
  return db.prepare("DELETE FROM shifts WHERE id = ?").run(id).changes > 0;
}

// ---------- Schedules ----------
function rowToSchedule(row: any) {
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    shiftIds: JSON.parse(row.shiftIds || "[]"),
    version: row.version ?? 0,
  };
}

export function listSchedules() {
  return db.prepare("SELECT * FROM schedules ORDER BY rowid").all().map(rowToSchedule);
}

/**
 * 整表替换（用于批量改/导入场景）。改为 upsert-only：不再 DELETE ALL，
 * 未出现在请求中的行保持不变，从而避免并发编辑时「后提交者删掉他人新增」的丢数据问题。
 * 单条增删请走 upsertSchedule / deleteSchedule。
 */
export function replaceSchedules(schedules: any[]) {
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
}) {
  const existing = db
    .prepare("SELECT version FROM schedules WHERE employeeId = ?")
    .get(s.employeeId) as { version: number } | undefined;

  if (existing) {
    if (s.expectedVersion !== undefined && s.expectedVersion !== existing.version) {
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
  return db.prepare("SELECT * FROM schedules WHERE employeeId = ?").get(s.employeeId);
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
export function listRecords(query: Record<string, any> = {}): any {
  const paging = resolvePaging(query);

  const clauses: string[] = [];
  const params: any[] = [];
  if (query.employeeId) {
    clauses.push("employeeId = ?");
    params.push(query.employeeId);
  }
  if (query.employeeName) {
    clauses.push("employeeName LIKE ?");
    params.push(`%${query.employeeName}%`);
  }
  if (query.dateFrom) {
    clauses.push("date >= ?");
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push("date <= ?");
    params.push(query.dateTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM punch_records ${where}`).get(...params) as any).c;

  if (!paging.requested) {
    // 向后兼容：未请求分页时返回完整数组
    const rows = db.prepare(`SELECT * FROM punch_records ${where} ORDER BY date, time`).all(...params) as any[];
    return rows;
  }

  const rows = db
    .prepare(`SELECT * FROM punch_records ${where} ORDER BY date, time LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset) as any[];
  return toListResult(rows, total, paging);
}

/**
 * 整表替换（Excel 导入语义）：清空后整体写入。保留该语义（导入即全量覆盖），
 * 但用事务包裹，避免中途失败留下半截数据。
 */
export function replaceRecords(records: any[]) {
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
}) {
  const id = r.id ?? crypto.randomUUID();
  const existing = db
    .prepare("SELECT version FROM punch_records WHERE id = ?")
    .get(id) as { version: number } | undefined;

  if (existing) {
    if (r.expectedVersion !== undefined && r.expectedVersion !== existing.version) {
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
  return db.prepare("SELECT * FROM punch_records WHERE id = ?").get(id);
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
export function listAnomalies() {
  return db.prepare("SELECT * FROM anomalies ORDER BY date, employeeId").all().map((row: any) => ({
    ...row,
    minutes: row.minutes === null ? undefined : row.minutes,
  }));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 真实异常分析：基于打卡记录 + 排班 + 班次时间计算，结果持久化 */
export function analyzeAnomalies() {
  const shifts: any[] = listShifts();
  const schedules = listSchedules();
  const records: any[] = listRecords();

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const scheduleMap = new Map(schedules.map((s) => [s.employeeId, s]));

  // 按 员工+日期 分组打卡
  const grouped = new Map<string, any[]>();
  for (const r of records) {
    const key = `${r.employeeId}__${r.date}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const anomalies: any[] = [];
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
  const count = (db.prepare("SELECT COUNT(*) AS c FROM shifts").get() as any).c;
  if (count > 0) return;
  db.prepare("INSERT INTO shifts (id, name, startTime, endTime) VALUES (?, ?, ?, ?)").run(
    "1", "正常班", "09:00", "18:00"
  );
  console.log("[db] Seeded default shift into SQLite");
})();
