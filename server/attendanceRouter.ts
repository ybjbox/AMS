/**
 * 考勤管理 API（/api/attendance/*）：
 *   GET/POST/PUT/DELETE /shifts     — 班次 CRUD
 *   GET/PUT  /schedules             — 批量排班（upsert-only，未出现的行不删）
 *   POST/PUT/DELETE /schedules[/:employeeId] — 单条排班增删改；DELETE /schedules 清空（仅 ADMIN）
 *   GET/PUT  /records               — 批量写入（upsert-only，未出现的行不删；空数组被拒）
 *   POST/PUT/DELETE /records[/:id]  — 单条打卡记录增删改；DELETE /records 清空（仅 ADMIN）
 *   GET      /anomalies /summary    — 异常列表 / 月报
 *   POST     /analyze               — 触发真实异常分析
 *
 * 删除永远走 DELETE，不要用 PUT 批量：PUT /schedules 删不掉行、PUT /records 会清库，
 * 这两条语义差异曾直接造成「排班删了又复活」与「一键清空全员打卡史」。
 */
import { Router, json, raw } from "express";
import { localToday } from "./localDate.ts";
import {
  listShifts, createShift, updateShift, deleteShift,
  listSchedules, replaceSchedules,
  upsertSchedule, deleteSchedule, clearSchedules,
  listRecords, upsertRecords,
  upsertRecord, deleteRecord, clearRecords,
  listAnomalies, analyzeAnomalies, analyzeAttendance, getAttendanceAnalysisStatus,
  PunchFormatError, VersionConflictError, monthlySummary } from "./attendanceDb.ts";
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
import {
  validateBody,
  shiftUpsertSchema,
  shiftUpdateSchema,
  deptShiftRuleSchema,
  deptShiftRuleUpdateSchema,
  schedulesBulkSchema,
  scheduleCreateSchema,
  scheduleUpdateSchema,
  punchRecordsBulkSchema,
  punchRecordCreateSchema,
} from "./validation.ts";

/**
 * P2 考勤异常通知：分析完成后按员工汇总当日异常，发给已关联账号的当事员工。
 * 幂等性由 notificationsDb 的未读去重保证（同标题+同内容不重复发）。
 * 仅通知当日异常，避免历史异常反复打扰。
 */
function notifyTodayAnomalies(anomalies: ReturnType<typeof analyzeAnomalies>): number {
  const today = localToday();
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

/**
 * 班次新增/改名。
 *
 * validateBody 之后 body 只剩 name/startTime/endTime —— **刻意不再让客户端带 id**：
 * 原先 `createShift(req.body)` 里 `input.id || randomUUID()`，前端同一毫秒造出两个 id 相同的新班次
 * 会直接撞主键变 500（第 12 批在部门/职位上已按"编号由服务端生成"收过一次，这里补齐）。
 */
attendanceRouter.post("/shifts", validateBody(shiftUpsertSchema), (req, res, next) => {
  try {
    res.status(201).json(createShift(req.body));
  } catch (e) {
    if (punchFormatErrorResponse(res, e)) return;
    next(e);
  }
});

attendanceRouter.put("/shifts/:id", validateBody(shiftUpdateSchema), (req, res, next) => {
  try {
    const updated = updateShift(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Shift not found" });
    res.json(updated);
  } catch (e) {
    if (punchFormatErrorResponse(res, e)) return;
    next(e);
  }
});

attendanceRouter.delete("/shifts/:id", (req, res) => {
  if (!deleteShift(req.params.id)) return res.status(404).json({ error: "Shift not found" });
  res.json({ success: true });
});

// ---- 部门工作时段（自动对班的配置面）----

/**
 * 打卡日期/时间的格式统一在数据层归一并校验（`attendanceDb.normalizePunchDate/Time`），
 * 路由只负责翻成 400 + 中文原因。刻意不再写一份 zod 正则：
 * 同一件事两处口径（校验一份、归一一份）正是过去反复出现的"两套说法"问题。
 */
function punchFormatErrorResponse(res: import("express").Response, e: unknown): boolean {
  if (e instanceof PunchFormatError) {
    res.status(400).json({ error: e.message });
    return true;
  }
  return false;
}

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

attendanceRouter.post("/shift-rules", validateBody(deptShiftRuleSchema), (req, res) => {
  try {
    res.status(201).json(createDeptShiftRule(req.body || {}));
  } catch (e) {
    ruleErrorResponse(res, e);
  }
});

attendanceRouter.put("/shift-rules/:id", validateBody(deptShiftRuleUpdateSchema), (req, res) => {
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
attendanceRouter.put("/schedules", validateBody(schedulesBulkSchema), (req, res) => {
  const { schedules } = req.body || {};
  if (!Array.isArray(schedules)) return res.status(400).json({ error: "schedules array is required" });
  res.json(replaceSchedules(schedules));
});

// 增量：单个员工排班 upsert（body.expectedVersion 可选启用乐观锁）
attendanceRouter.post("/schedules", validateBody(scheduleCreateSchema), (req, res, next) => {
  const { employeeId, employeeName, shiftIds, expectedVersion } = req.body || {};
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
attendanceRouter.put("/schedules/:employeeId", validateBody(scheduleUpdateSchema), (req, res, next) => {
  const { employeeName, shiftIds, expectedVersion } = req.body || {};
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

// 批量写入（Excel 导入语义）：upsert-only，未出现的行保持原样，维持默认写策略（HR+）。
// 这里此前是先 DELETE 全表再整体插入 —— 于是任何 HR 提交一行就能清空全库打卡记录，
// 而整表清空本有 DELETE /records（仅 ADMIN，界面上单独确认）这条带门槛的路。
// 空数组仍然被拒：它从来不是有效的导入清单，而更像是「误触了清空」。
attendanceRouter.put("/records", validateBody(punchRecordsBulkSchema), (req, res, next) => {
  const { records } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "导入清单为空，已取消；确需清空全部打卡记录请用「全部清空打卡记录」" });
  }
  try {
    res.json(upsertRecords(records));
  } catch (e) {
    if (punchFormatErrorResponse(res, e)) return;
    next(e);
  }
});

// 增量：单条打卡记录 upsert（body.expectedVersion 可选启用乐观锁）
attendanceRouter.post("/records", validateBody(punchRecordCreateSchema), (req, res, next) => {
  const { employeeId, employeeName, date, time, expectedVersion } = req.body || {};
  try {
    res.status(201).json(upsertRecord({ id: req.body.id, employeeId, employeeName, date, time, expectedVersion }));
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: e.message, code: "VERSION_CONFLICT" });
    }
    if (punchFormatErrorResponse(res, e)) return;
    next(e);
  }
});

// 增量：更新单条打卡记录（id 在路径上，body 里那个不作数）
attendanceRouter.put("/records/:id", validateBody(punchRecordCreateSchema), (req, res, next) => {
  const { employeeId, employeeName, date, time, expectedVersion } = req.body || {};
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
    if (punchFormatErrorResponse(res, e)) return;
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
      // 本地当月：UTC 口径下每月 1 日 00:00–07:59 会查成上个月
      : localToday().slice(0, 7);
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
