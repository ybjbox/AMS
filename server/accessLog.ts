/**
 * 结构化请求日志（可观测性基建）。
 *
 * 设计：
 * - 单行 JSON 输出到 stdout（docker/k8s 环境天然可采集）
 * - 只记录慢请求（> SLOW_MS）与错误响应（status >= 400），避免日志洪水
 * - 与 audit_logs 分工：audit = 业务留痕（谁改了什么，永久）；access log = 运行可观测（旋转丢弃）
 */
import type { Request, Response, NextFunction } from "express";

/** 超过该耗时的请求记为慢请求（毫秒） */
const SLOW_MS = Number(process.env.LOG_SLOW_MS) || 1000;

export interface AccessLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  slow: boolean;
  actor?: string;
  ip?: string;
  error?: string;
}

/** 内存环形缓冲：保留最近 N 条（供运行诊断面板读取；进程重启即清空，属预期） */
const RING_CAPACITY = Number(process.env.LOG_RING_SIZE) || 200;
const ring: AccessLogEntry[] = [];

/** 读取最近的访问日志条目（新→旧）。供 /api/system/diagnostics 使用。 */
export function recentAccessLogs(limit = 50): AccessLogEntry[] {
  const n = Math.min(Math.max(limit, 1), RING_CAPACITY);
  return ring.slice(-n).reverse();
}

/** 汇总统计：最近窗口内的慢请求数与错误数 */
export function accessLogSummary(): { total: number; slow: number; errors: number } {
  let slow = 0;
  let errors = 0;
  for (const e of ring) {
    if (e.slow) slow++;
    if (e.status >= 400) errors++;
  }
  return { total: ring.length, slow, errors };
}

/** 结构化输出（单行 JSON，便于 grep/jq/Loki 采集）+ 写入环形缓冲 */
function emit(entry: AccessLogEntry): void {
  // JSON.stringify 顺序稳定，便于阅读与采集
  process.stdout.write(JSON.stringify(entry) + "\n");
  ring.push(entry);
  if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
}

/** 挂载于所有路由之后（含错误处理之前的响应监听）。 */
export function accessLog(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // 健康检查不打点（探活高频且无价值）
    if (req.path === "/api/health") return next();

    const started = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - started;
      const status = res.statusCode;
      const slow = durationMs >= SLOW_MS;

      // 记录条件：慢请求 或 失败响应（4xx/5xx）
      if (!slow && status < 400) return;

      emit({
        ts: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl.split("?")[0] || req.path,
        status,
        durationMs,
        slow,
        actor: req.auth?.username,
        ip: req.ip,
      });
    });
    next();
  };
}

/** 进程级未捕获异常兜底记录（防止静默崩溃） */
export function installProcessGuards(): void {
  process.on("unhandledRejection", (reason) => {
    emit({
      ts: new Date().toISOString(),
      method: "-",
      path: "unhandledRejection",
      status: 500,
      durationMs: 0,
      slow: false,
      error: reason instanceof Error ? reason.stack : String(reason),
    });
  });
  process.on("uncaughtException", (err) => {
    emit({
      ts: new Date().toISOString(),
      method: "-",
      path: "uncaughtException",
      status: 500,
      durationMs: 0,
      slow: false,
      error: err.stack,
    });
    // uncaughtException 后进程状态不可信，记录后按 Node 惯例退出（由进程管理器重启）
    process.exit(1);
  });
}
