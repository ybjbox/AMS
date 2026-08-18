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
} from "./attendanceDb.ts";

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

// 增量：单个员工排班 upsert
attendanceRouter.post("/schedules", (req, res) => {
  const { employeeId, employeeName, shiftIds } = req.body || {};
  if (!employeeId || !employeeName) {
    return res.status(400).json({ error: "employeeId and employeeName are required" });
  }
  res.status(201).json(upsertSchedule({ employeeId, employeeName, shiftIds }));
});

// 增量：更新单个员工排班
attendanceRouter.put("/schedules/:employeeId", (req, res) => {
  const { employeeName, shiftIds } = req.body || {};
  if (!employeeName) return res.status(400).json({ error: "employeeName is required" });
  res.json(upsertSchedule({ employeeId: req.params.employeeId, employeeName, shiftIds }));
});

// 增量：删除单个员工排班
attendanceRouter.delete("/schedules/:employeeId", (req, res) => {
  if (!deleteSchedule(req.params.employeeId)) return res.status(404).json({ error: "Schedule not found" });
  res.json({ success: true });
});

// 增量：清空所有排班
attendanceRouter.delete("/schedules", (_req, res) => {
  clearSchedules();
  res.json({ success: true });
});

// ---- Punch Records ----
attendanceRouter.get("/records", (req, res) => {
  res.json(listRecords(req.query));
});

// 整表替换（Excel 导入语义）：清空后整体写入
attendanceRouter.put("/records", (req, res) => {
  const { records } = req.body || {};
  if (!Array.isArray(records)) return res.status(400).json({ error: "records array is required" });
  res.json(replaceRecords(records));
});

// 增量：单条打卡记录 upsert
attendanceRouter.post("/records", (req, res) => {
  const { employeeId, employeeName, date, time } = req.body || {};
  if (!employeeId || !employeeName || !date || !time) {
    return res.status(400).json({ error: "employeeId, employeeName, date, time are required" });
  }
  res.status(201).json(upsertRecord({ id: req.body.id, employeeId, employeeName, date, time }));
});

// 增量：更新单条打卡记录
attendanceRouter.put("/records/:id", (req, res) => {
  const { employeeId, employeeName, date, time } = req.body || {};
  if (!employeeId || !employeeName || !date || !time) {
    return res.status(400).json({ error: "employeeId, employeeName, date, time are required" });
  }
  res.json(upsertRecord({ id: req.params.id, employeeId, employeeName, date, time }));
});

// 增量：删除单条打卡记录
attendanceRouter.delete("/records/:id", (req, res) => {
  if (!deleteRecord(req.params.id)) return res.status(404).json({ error: "Record not found" });
  res.json({ success: true });
});

// 增量：清空所有打卡记录
attendanceRouter.delete("/records", (_req, res) => {
  clearRecords();
  res.json({ success: true });
});

// ---- Anomalies ----
attendanceRouter.get("/anomalies", (_req, res) => {
  res.json(listAnomalies());
});

attendanceRouter.post("/analyze", (_req, res) => {
  const anomalies = analyzeAnomalies();
  res.json({ success: true, message: `分析完成，共发现 ${anomalies.length} 条异常`, anomalies });
});
