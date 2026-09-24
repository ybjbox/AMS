/**
 * 企业微信考勤接入 API，挂在 /api/wecom（策略：ADMIN 及以上，见 authMiddleware POLICIES）。
 *
 * - GET   /config            凭据（corpSecret 掩码回显）
 * - PUT   /config            保存凭据（回传掩码=不改，__CLEAR__=清除）
 * - POST  /test              连通性检测（只换一次 token，不取数据）
 * - GET   /bindings          成员映射（已认领 + 待认领）
 * - PUT   /bindings          批量认领 / 改绑 / 解绑
 * - DELETE/bindings/:userid  删除一条映射
 * - POST  /preview           干跑：拉数据、报归属，但一行都不写
 * - POST  /sync              立即同步（202 + jobId，复用 import_jobs 轮询通道）
 * - GET   /sync/jobs/:id     同步任务进度
 * - GET   /status            游标与上次结果
 *
 * access_token 与 corpSecret 一律不出服务端：读接口只回掩码。
 */
import { Router, json } from "express";
import { getEmployee } from "./db.ts";
import {
  createImportJob,
  getImportJob,
  markJobDone,
  markJobError,
  markJobProgress,
} from "./importJobsDb.ts";
import {
  deleteWeComBinding,
  findEmployeeClaim,
  getWeComConfig,
  getWeComSyncState,
  isWeComConfigured,
  listWeComBindings,
  maskedWeComConfig,
  mergeWeComConfig,
  setWeComConfig,
  upsertWeComBinding,
  WeComConfigError,
} from "./wecomDb.ts";
import { restartWeComSyncScheduler, runWeComSync, testWeComConnection, WeComSyncError } from "./wecomSync.ts";
import { errMessage, validateBody, wecomBindingsSchema, wecomConfigSchema } from "./validation.ts";

export const wecomRouter = Router();

wecomRouter.use(json({ limit: "64kb" }));

wecomRouter.get("/config", (_req, res) => {
  res.json(maskedWeComConfig());
});

wecomRouter.put("/config", validateBody(wecomConfigSchema), (req, res) => {
  try {
    setWeComConfig(mergeWeComConfig(req.body));
    // 保存即生效：以前定时任务只在进程启动时装一次，界面上打开开关后什么都不会发生
    const scheduler = restartWeComSyncScheduler();
    res.json({ ...maskedWeComConfig(), schedulerRunning: scheduler.running, schedulerReason: scheduler.reason });
    return;
  } catch (e) {
    if (e instanceof WeComConfigError) return res.status(400).json({ error: e.message });
    return res.status(500).json({ error: errMessage(e) });
  }
});

wecomRouter.get("/status", (_req, res) => {
  const cfg = getWeComConfig();
  res.json({
    configured: isWeComConfigured(cfg),
    enabled: cfg.enabled,
    scheduler: { intervalMinutes: cfg.syncIntervalMinutes, overlapMinutes: cfg.overlapMinutes },
    bindings: {
      total: listWeComBindings().length,
      pending: listWeComBindings().filter((b) => !b.employeeId).length,
    },
    state: getWeComSyncState(),
  });
});

wecomRouter.post("/test", async (_req, res) => {
  res.json(await testWeComConnection());
});

wecomRouter.get("/bindings", (_req, res) => {
  res.json({ items: listWeComBindings() });
});

wecomRouter.put("/bindings", validateBody(wecomBindingsSchema), (req, res) => {
  const items = (req.body as { items: { wecomUserId: string; employeeId: string | null }[] }).items;
  const missing = items.find((i) => i.employeeId && !getEmployee(i.employeeId));
  if (missing) {
    return res.status(400).json({ error: `员工档案不存在：${missing.employeeId}（${missing.wecomUserId}）` });
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.employeeId) continue;
    if (seen.has(item.employeeId)) {
      return res.status(400).json({ error: `本次提交里员工 ${item.employeeId} 被两个企业微信账号认领` });
    }
    seen.add(item.employeeId);
    const owner = findEmployeeClaim(item.employeeId, item.wecomUserId);
    if (owner) {
      return res.status(400).json({ error: `员工 ${item.employeeId} 已被企业微信账号 ${owner} 认领，一个人只能有一个账号` });
    }
  }
  const operator = req.auth?.username ?? "";
  for (const item of items) upsertWeComBinding({ ...item, operator });
  res.json({ items: listWeComBindings() });
});

wecomRouter.delete("/bindings/:wecomUserId", (req, res) => {
  const id = String(req.params.wecomUserId ?? "");
  if (!id || id.length > 64) return res.status(400).json({ error: "userid 不合法" });
  res.json({ removed: deleteWeComBinding(id) });
});

wecomRouter.post("/preview", async (req, res) => {
  try {
    const body = (req.body ?? {}) as { dateFrom?: string; dateTo?: string };
    const report = await runWeComSync({ dryRun: true, dateFrom: body.dateFrom, dateTo: body.dateTo });
    res.json(report);
  } catch (e) {
    res.status(syncStatus(e)).json({ error: errMessage(e) });
  }
});

wecomRouter.post("/sync", async (req, res) => {
  const body = (req.body ?? {}) as { dateFrom?: string; dateTo?: string };
  // 先把"根本没法开始"的错误同步报出去，别给前端一个跑不出结果的 jobId
  try {
    const cfg = getWeComConfig();
    if (!isWeComConfigured(cfg)) return res.status(400).json({ error: "企业微信凭据未配齐，先保存配置" });
  } catch (e) {
    return res.status(400).json({ error: errMessage(e) });
  }
  const jobId = createImportJob(req.auth?.username ?? "", 0);
  void runWeComSync({
    dryRun: false,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    onProgress: (processed, created, skipped) => markJobProgress(jobId, processed, created, skipped),
  })
    .then((report) => {
      markJobProgress(jobId, report.fetched, report.written, report.skipped);
      markJobDone(jobId);
    })
    .catch((e) => {
      console.error("[wecom] 同步任务失败：", e);
      markJobError(jobId, errMessage(e));
    });
  res.status(202).json({ jobId });
});

wecomRouter.get("/sync/jobs/:id", (req, res) => {
  const job = getImportJob(String(req.params.id ?? ""));
  if (!job) return res.status(404).json({ error: "任务不存在" });
  const username = req.auth?.username ?? "";
  const role = req.auth?.systemRole ?? "";
  const isStaff = role === "ADMIN" || role === "SUPER_ADMIN";
  // 与员工导入同一口径：本人或管理员可查（管理员要能在别人掉线后继续看进度）
  if (job.username !== username && !isStaff) {
    return res.status(403).json({ error: "只能查看自己发起的同步任务" });
  }
  res.json(job);
});

function syncStatus(e: unknown): number {
  if (e instanceof WeComSyncError || e instanceof WeComConfigError) return e.status;
  const status = (e as { status?: number })?.status;
  return typeof status === "number" && status >= 400 ? status : 502;
}
