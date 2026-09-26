/**
 * 运行诊断路由（可观测性面板后端）。
 *
 * GET /api/system/diagnostics（ADMIN+，见 authMiddleware POLICIES）
 * 返回：进程健康 + 访问日志汇总 + 最近慢请求/错误 + 关键表行数。
 *
 * 设计：全部为只读聚合，无敏感明细（不返回 token/请求体）；
 * 数据源为内存环形缓冲（重启清空，属预期——历史数据在 stdout 由外部采集）。
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { db, DATA_DIR } from "./db.ts";
import { recentAccessLogs, accessLogSummary } from "./accessLog.ts";
import { asNumber } from "./sqliteUtil.ts";
import { SCHEMA_VERSION } from "./migrate.ts";
import { freeBytesAt, getBackupConfig, getLastBackupRun } from "./backupDb.ts";
import { otherInstances } from "./instanceLock.ts";
import { pdfRenderQueueDepth } from "./pdfWorker.ts";

export const systemRouter = Router();

/** 应用版本（与 /api/health 同源读取） */
const APP_VERSION: string = (() => {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
        version?: string;
      }
    ).version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

/** 统计的关键表（硬编码列表，无用户输入拼入） */
const COUNT_TABLES = [
  "employees",
  "accounts",
  "sessions",
  "audit_logs",
  "security_events",
  "punch_records",
  "todos",
  "notifications",
  "approvals",
  "documents",
] as const;

systemRouter.get("/diagnostics", (req, res) => {
  // 1) 进程健康
  let dbOk = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }
  const mem = process.memoryUsage();
  const backupConfig = getBackupConfig();
  const free = freeBytesAt(DATA_DIR);

  // 2) 关键表行数
  const tableCounts: Record<string, number> = {};
  for (const t of COUNT_TABLES) {
    try {
      tableCounts[t] = asNumber(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get()?.c);
    } catch {
      tableCounts[t] = -1; // 表不存在或读取失败
    }
  }

  // 3) 访问日志（内存环形缓冲：最近 50 条）
  const summary = accessLogSummary();
  const recent = recentAccessLogs(50);

  res.json({
    generatedAt: new Date().toISOString(),
    health: {
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      uptimeSec: Math.round(process.uptime()),
      memHeapMB: Math.round(mem.heapUsed / 1024 / 1024),
      memRssMB: Math.round(mem.rss / 1024 / 1024),
      version: APP_VERSION,
      nodeVersion: process.version,
      // 运维三问：库结构是什么版本、盘还剩多少、备份还是不是活的。
      // 这些信息只给管理员（诊断面板），公开探针 /api/health 保持最小面。
      schemaVersion: SCHEMA_VERSION,
      dataDir: DATA_DIR,
      diskFreeMB: free === null ? null : Math.round(free / 1024 / 1024),
      backups: {
        enabled: backupConfig.enabled,
        count: backupConfig.count,
        maxCount: backupConfig.maxCount,
        retentionDays: backupConfig.retentionDays,
        intervalMinutes: Math.round(backupConfig.intervalMs / 60000),
        last: getLastBackupRun(),
      },
      // 同一数据目录上的其它实例：恢复备份前必须先看清这一项
      otherInstances: otherInstances(),
      // PDF 渲染串行链的积压（>0 说明有人正在逐页栅格化，全站会短暂变慢）
      pdfRenderQueue: pdfRenderQueueDepth(),
    },
    accessLog: {
      ...summary,
      // 环形缓冲窗口大小（供前端展示"最近 N 条"的语义）
      capacity: Number(process.env.LOG_RING_SIZE) || 200,
      slowThresholdMs: Number(process.env.LOG_SLOW_MS) || 1000,
    },
    recent,
    tableCounts,
    requester: req.auth?.username ?? "",
  });
});
