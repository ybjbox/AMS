/**
 * 考勤管理 API（/api/attendance/*）：
 *   GET/POST/PUT/DELETE /shifts     — 班次 CRUD
 *   GET/PUT             /schedules  — 排班（整体替换）
 *   GET/PUT             /records    — 打卡记录（整体替换，前端解析 Excel 后提交）
 *   GET                 /anomalies  — 异常列表
 *   POST                /analyze    — 触发真实异常分析
 */
import { Router, json } from "express";
import {
  listShifts, createShift, updateShift, deleteShift,
  listSchedules, replaceSchedules,
  upsertSchedule, deleteSchedule, clearSchedules,
  listRecords, replaceRecords,
  upsertRecord, deleteRecord, clearRecords,
  listAnomalies, analyzeAnomalies,
  VersionConflictError, monthlySummary } from "./attendanceDb.ts";
import { db } from "./db.ts";
import { asString } from "./sqliteUtil.ts";
import { requireRole } from "./authMiddleware.ts";
import { createNotification } from "./notificationsDb.ts";

/**
 * P2 考勤异常通知：分析完成后按员工汇总当日异常，发给已关联账号的当事员工。
 * 幂等性由 notificationsDb 的未读去重保证（同标题+同内容不重复发）。
 * 仅通知当日异常，避免历史异常反复打扰。
 */
function notifyTodayAnomalies(anomalies: ReturnType<typeof analyzeAnomalies>): number {
  const today = new Date().toISOString().slice(0, 10);
  const byEmployee = new Map<string, string[]>();
  for (const a of anomalies) {
    if (a.date !== today) continue;
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push(a.description);
    byEmployee.set(a.employeeId, list);
  }
  let sent = 0;
  for (const [employeeId, descriptions] of byEmployee) {
    const acc = db.prepare("SELECT username FROM accounts WHERE employeeId = ? AND enabled = 1").get(employeeId);
    const username = asString(acc?.username);
    if (!username) continue; // 未关联账号的员工无法接收通知，跳过
    createNotification({
      title: `考勤异常提醒（${today}）`,
      message: `今日发现 ${descriptions.length} 条考勤异常：${descriptions.join("；")}。如有疑问请申请补卡或联系 HR。`,
      type: "warning",
      recipient: username,
    });
    sent += 1;
  }
  return sent;
}

export const attendanceRouter = Router();
attendanceRouter.use(json({ limit: "20mb" }));

// ---- Shifts ----
attendanceRouter.get("/shifts", (_req, res) => {
  res.json(listShifts());
});

attendanceRouter.post("/shifts", (req, res) => {
  const { name, startTime, endTime } = req.body || {};
  if (!name || !startTime || !endTime) {
    return res.status(400).json({ error: "name, startTime, endTime are required" });
  }
  res.status(201).json(createShift(req.body));
});

attendanceRouter.put("/shifts/:id", (req, res) => {
  const updated = updateShift(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Shift not found" });
  res.json(updated);
});

attendanceRouter.delete("/shifts/:id", (req, res) => {
  if (!deleteShift(req.params.id)) return res.status(404).json({ error: "Shift not found" });
  res.json({ success: true });
});

// ---- Schedules ----
attendanceRouter.get("/schedules", (_req, res) => {
  res.json(listSchedules());
});

// 整表替换（批量改/导入）：upsert-only，不删除未提及行，避免并发覆盖
attendanceRouter.put("/schedules", (req, res) => {
  const { schedules } = req.body || {};
  if (!Array.isArray(schedules)) return res.status(400).json({ error: "schedules array is required" });
  res.json(replaceSchedules(schedules));
});

// 增量：单个员工排班 upsert（body.expectedVersion 可选启用乐观锁）
attendanceRouter.post("/schedules", (req, res, next) => {
  const { employeeId, employeeName, shiftIds, expectedVersion } = req.body || {};
  if (!employeeId || !employeeName) {
    return res.status(400).json({ error: "employeeId and employeeName are required" });
  }
  try {
    res.status(201).json(upsertSchedule({ employeeId, employeeName, shiftIds, expectedVersion }));
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: e.message, code: "VERSION_CONFLICT" });
    }
    next(e);
  }
});

// 增量：更新单个员工排班
attendanceRouter.put("/schedules/:employeeId", (req, res, next) => {
  const { employeeName, shiftIds, expectedVersion } = req.body || {};
  if (!employeeName) return res.status(400).json({ error: "employeeName is required" });
  try {
    res.json(
      upsertSchedule({
        employeeId: req.params.employeeId,
        employeeName,
        shiftIds,
        expectedVersion,
      })
    );
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: e.message, code: "VERSION_CONFLICT" });
    }
    next(e);
  }
});

// 增量：删除单个员工排班
attendanceRouter.delete("/schedules/:employeeId", (req, res) => {
  if (!deleteSchedule(req.params.employeeId)) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true });
});

// 增量：清空所有排班（整表级破坏性操作：仅 ADMIN，默认 HR+ 写策略之上再收紧一档）
attendanceRouter.delete("/schedules", requireRole("ADMIN"), (_req, res) => {
  clearSchedules();
  res.json({ success: true });
});

// ---- Punch Records ----
attendanceRouter.get("/records", (req, res) => {
  res.json(listRecords(req.query));
});

// 整表替换（Excel 导入语义）：清空后整体写入——考勤页导入功能的承载端点，
// 维持默认写策略（HR+）；如需收紧到 ADMIN，须同步调整前端导入入口的角色门槛
attendanceRouter.put("/records", (req, res) => {
  const { records } = req.body || {};
  if (!Array.isArray(records)) return res.status(400).json({ error: "records array is required" });
  res.json(replaceRecords(records));
});

// 增量：单条打卡记录 upsert（body.expectedVersion 可选启用乐观锁）
attendanceRouter.post("/records", (req, res, next) => {
  const { employeeId, employeeName, date, time, expectedVersion } = req.body || {};
  if (!employeeId || !employeeName || !date || !time) {
    return res.status(400).json({ error: "employeeId, employeeName, date, time are required" });
  }
  try {
    res.status(201).json(upsertRecord({ id: req.body.id, employeeId, employeeName, date, time, expectedVersion }));
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: e.message, code: "VERSION_CONFLICT" });
    }
    next(e);
  }
});

// 增量：更新单条打卡记录
attendanceRouter.put("/records/:id", (req, res, next) => {
  const { employeeId, employeeName, date, time, expectedVersion } = req.body || {};
  if (!employeeId || !employeeName || !date || !time) {
    return res.status(400).json({ error: "employeeId, employeeName, date, time are required" });
  }
  try {
    res.json(
      upsertRecord({
        id: req.params.id,
        employeeId,
        employeeName,
        date,
        time,
        expectedVersion,
      })
    );
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: e.message, code: "VERSION_CONFLICT" });
    }
    next(e);
  }
});

// 增量：删除单条打卡记录
attendanceRouter.delete("/records/:id", (req, res) => {
  if (!deleteRecord(req.params.id)) return res.status(404).json({ error: "Record not found" });
  res.json({ success: true });
});

// 增量：清空所有打卡记录（整表级破坏性操作：仅 ADMIN+）
attendanceRouter.delete("/records", requireRole("ADMIN"), (_req, res) => {
  clearRecords();
  res.json({ success: true });
});

// ---- Anomalies ----
/** 月度考勤汇总（月报）：GET /api/attendance/summary?month=YYYY-MM */
attendanceRouter.get("/summary", (req, res) => {
  const month =
    typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
  res.json({ month, rows: monthlySummary(month) });
});

attendanceRouter.get("/anomalies", (_req, res) => {
  res.json(listAnomalies());
});

attendanceRouter.post("/analyze", (_req, res) => {
  const anomalies = analyzeAnomalies();
  const notified = notifyTodayAnomalies(anomalies);
  res.json({ success: true, message: `分析完成，共发现 ${anomalies.length} 条异常`, anomalies, notified });
});
