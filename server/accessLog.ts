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

interface AccessLogEntry {
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

/** 结构化输出（单行 JSON，便于 grep/jq/Loki 采集） */
function emit(entry: AccessLogEntry): void {
  // JSON.stringify 顺序稳定，便于阅读与采集
  process.stdout.write(JSON.stringify(entry) + "\n");
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
