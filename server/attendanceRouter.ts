/**
 * 考勤管理 API（/api/attendance/*）：
 *   GET/POST/PUT/DELETE /shifts     — 班次 CRUD
 *   GET/PUT  /schedules             — 批量排班（upsert-only，未出现的行不删）
 *   POST/PUT/DELETE /schedules[/:employeeId] — 单条排班增删改；DELETE /schedules 清空（仅 ADMIN）
 *   GET/PUT  /records               — Excel 导入语义的整表替换（空数组被拒）
 *   POST/PUT/DELETE /records[/:id]  — 单条打卡记录增删改；DELETE /records 清空（仅 ADMIN）
 *   GET      /anomalies /summary    — 异常列表 / 月报
 *   POST     /analyze               — 触发真实异常分析
 *
 * 删除永远走 DELETE，不要用 PUT 批量：PUT /schedules 删不掉行、PUT /records 会清库，
 * 这两条语义差异曾直接造成「排班删了又复活」与「一键清空全员打卡史」。
 */
import { Router, json, raw } from "express";
import {
  listShifts, createShift, updateShift, deleteShift,
  listSchedules, replaceSchedules,
  upsertSchedule, deleteSchedule, clearSchedules,
  listRecords, replaceRecords,
  upsertRecord, deleteRecord, clearRecords,
  listAnomalies, analyzeAnomalies, analyzeAttendance, getAttendanceAnalysisStatus,
  VersionConflictError, monthlySummary } from "./attendanceDb.ts";
import {
  createDeptShiftRule,
  deleteDeptShiftRule,
  listDeptShiftRules,
  resolveRulesForDepartment,
  ShiftRuleError,
  updateDeptShiftRule,
} from "./shiftRulesDb.ts";
import { db } from "./db.ts";
import { asString } from "./sqliteUtil.ts";
import { requireRole } from "./authMiddleware.ts";
import { ROLE_LEVEL } from "./authDb.ts";
import { createNotification } from "./notificationsDb.ts";
import { serverErrorResponse } from "./errorHandler.ts";
import { createImportJob, getImportJob } from "./importJobsDb.ts";
import {
  MAX_PUNCH_IMPORT_ROWS,
  buildAttendanceTemplate,
  previewAttendanceImport,
  runAttendanceImportJob,
} from "./attendanceImportDb.ts";

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

// ---- 部门工作时段（自动对班的配置面）----

/** 时段配置错误的共同特征：都是"用户能改对"的输入问题，一律 400 + 中文原因 */
function ruleErrorResponse(res: import("express").Response, e: unknown) {
  if (e instanceof ShiftRuleError) return res.status(400).json({ error: e.message });
  throw e;
}

attendanceRouter.get("/shift-rules", (_req, res) => {
  res.json(listDeptShiftRules());
});

/** 某个部门的生效视图（含向上继承），给面板显示"这些时段实际来自哪个部门" */
attendanceRouter.get("/shift-rules/effective", (req, res) => {
  const departmentId = String(req.query.departmentId ?? "");
  const resolved = resolveRulesForDepartment(departmentId);
  res.json({
    departmentId,
    rules: resolved.rules,
    sourceDepartmentId: resolved.sourceDepartmentId,
    sourceDepartmentName: resolved.sourceDepartmentName,
    inherited: resolved.depth > 0,
    depth: resolved.depth,
  });
});

attendanceRouter.post("/shift-rules", (req, res) => {
  try {
    res.status(201).json(createDeptShiftRule(req.body || {}));
  } catch (e) {
    ruleErrorResponse(res, e);
  }
});

attendanceRouter.put("/shift-rules/:id", (req, res) => {
  try {
    const updated = updateDeptShiftRule(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "时段不存在" });
    res.json(updated);
  } catch (e) {
    ruleErrorResponse(res, e);
  }
});

attendanceRouter.delete("/shift-rules/:id", (req, res) => {
  if (!deleteDeptShiftRule(req.params.id)) return res.status(404).json({ error: "时段不存在" });
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
// 维持默认写策略（HR+）；如需收紧到 ADMIN，须同步调整前端导入入口的角色门槛。
// 空数组在这里被拒：它是「全库打卡记录清零」的唯一整表入口，而清空本有
// DELETE /records（仅 ADMIN）这条带角色门槛的路，不该由导入语义顺带触发。
attendanceRouter.put("/records", (req, res) => {
  const { records } = req.body || {};
  if (!Array.isArray(records)) return res.status(400).json({ error: "records array is required" });
  if (records.length === 0) {
    return res.status(400).json({ error: "导入清单为空，已取消；确需清空全部打卡记录请用「全部清空打卡记录」" });
  }
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

// ---- 打卡记录批量导入（服务端解析，流程与员工导入一致）----
// 注意注册在 /records/:id 之前不存在冲突：这里只有 GET /records/import/template 与两个 POST。

// GET /records/import/template — 下载导入模板
attendanceRouter.get("/records/import/template", async (_req, res) => {
  try {
    const buffer = await buildAttendanceTemplate();
    res.setHeader(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" + encodeURIComponent("打卡记录导入模板.xlsx")
    );
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// POST /records/import — 上传 xlsx（binary）→ 解析 + 逐行校验 + 预览
attendanceRouter.post("/records/import", raw({ type: "*/*", limit: "10mb" }), async (req, res) => {
  try {
    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: "未接收到文件内容" });
    }
    res.json(await previewAttendanceImport(buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: `解析失败：${message}` });
  }
});

// POST /records/import/commit — 确认导入：立即返回 jobId，后台分块落库（同一分钟重复行自动跳过）
attendanceRouter.post("/records/import/commit", (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows 不能为空" });
    }
    if (rows.length > MAX_PUNCH_IMPORT_ROWS) {
      return res.status(400).json({ error: `单次最多导入 ${MAX_PUNCH_IMPORT_ROWS} 行` });
    }
    const jobId = createImportJob(req.auth!.username, rows.length);
    void runAttendanceImportJob(jobId, rows);
    res.status(202).json({ jobId });
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// GET /records/import/jobs/:id — 轮询导入进度（仅任务创建者或 ADMIN+）
attendanceRouter.get("/records/import/jobs/:id", (req, res) => {
  const job = getImportJob(req.params.id);
  if (!job) return res.status(404).json({ error: "导入任务不存在" });
  if (job.username !== req.auth!.username && ROLE_LEVEL[req.auth!.systemRole] < ROLE_LEVEL.ADMIN) {
    return res.status(403).json({ error: "无权查看该导入任务" });
  }
  res.json(job);
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

/** 上一次分析的覆盖率（留档在服务端，刷新/换设备也看得到"为什么没有异常"） */
attendanceRouter.get("/anomalies/status", (_req, res) => {
  res.json(getAttendanceAnalysisStatus());
});

attendanceRouter.post("/analyze", (_req, res) => {
  const { anomalies, coverage } = analyzeAttendance();
  const notified = notifyTodayAnomalies(anomalies);
  res.json({
    success: true,
    message: `分析完成，共发现 ${anomalies.length} 条异常`,
    anomalies,
    coverage,
    notified,
  });
});
