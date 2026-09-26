/**
 * 集中式错误处理（P3-1）。
 *
 * 之前每个 router 各写各的 try/catch，且 documentsRouter 的 folders/document-sets
 * 等同步分支根本没有 catch —— 一旦同步抛错，Express 默认会返回 HTML 错误页。
 *
 * 这里提供一个 4 参数的 Express 错误处理中间件：任何未被业务代码捕获的同步 throw
 * 或 next(err)，都会被统一收敛成 JSON `{ error }` 错误体，且服务端记日志。
 * 业务 router 里既有的 try/catch（返回一致的错误体）继续保留，本中间件是兜底安全网，
 * 保证「全站任何异常都返回 JSON，绝不再吐 HTML 错误页」。
 */
import type { ErrorRequestHandler, RequestHandler } from "express";
import { errMessage } from "./validation.ts";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    (err as { status?: number; statusCode?: number })?.status ||
    (err as { status?: number; statusCode?: number })?.statusCode ||
    500;

  // 5xx 细节只落服务端日志，响应一律通用文案，避免 SQL/内部错误串外泄；4xx 保留可读原因。
  const message =
    status >= 500 ? "服务器内部错误" : errMessage(err) || "请求处理失败";
  if (status >= 500) {
    console.error("[error-handler] 未捕获异常：", err);
  }

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
};

/**
 * 5xx 统一出口：供各 router 的 try/catch 使用。细节落服务端日志，
 * 响应只给调用方传入的通用文案，杜绝把 e.message（含 SQL 报错）直接回给前端。
 */
export function serverErrorResponse(
  res: import("express").Response,
  error: unknown,
  message = "服务器内部错误"
): void {
  console.error("[server-error]", error);
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
}

/**
 * 4xx 统一出口：**只有"业务代码主动要告诉调用方"的错误**才原样回文案。
 *
 * 三个个人数据路由（待办/通知/留存）原先一律 `res.status(400).json({ error: errMessage(error) })`，
 * 于是 SqliteError（`UNIQUE constraint failed: saved_items.kind, saved_items.owner, saved_items.name`、
 * `database is locked`、`disk I/O error`）也被当成"参数不合法"原样回前端 —— 表名、列名、库的状态
 * 全暴露，而且状态码还骗人。判别方式用错误自身的身份而不是猜文案：
 * 我们自己的领域错误都有类名（AuthError / DeptDataError / PunchFormatError / ExtractError…），
 * 落到这里还叫得出名字的基本就是它们；系统级错误则是固定几个内建名。
 */
const SYSTEM_ERROR_NAMES = new Set([
  "SqliteError",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "EvalError",
]);

export function clientErrorResponse(
  res: import("express").Response,
  error: unknown,
  fallback = "请求参数不合法"
): void {
  const declared = (error as { status?: number; statusCode?: number })?.status
    ?? (error as { statusCode?: number })?.statusCode
    ?? 400;
  const name = (error as { name?: string })?.name ?? "";
  const nodeErrCode = (error as { code?: string })?.code ?? "";
  const looksSystemic =
    SYSTEM_ERROR_NAMES.has(name) ||
    nodeErrCode.startsWith("ERR_") ||
    nodeErrCode.startsWith("SQLITE_") ||
    name === "Error" && declared >= 500;
  if (looksSystemic) {
    console.error("[client-error] 非业务错误，已收敛为通用文案：", error);
    if (!res.headersSent) res.status(500).json({ error: "服务器内部错误" });
    return;
  }
  const status = declared >= 400 && declared < 500 ? declared : 400;
  if (!res.headersSent) res.status(status).json({ error: errMessage(error) || fallback });
}

/**
 * 包装 async 路由处理器，使 Promise rejection 也能流入 errorHandler。
 * 当前各 router 主体均为同步函数（node:sqlite 是同步 API），本工具主要面向
 * 未来可能出现或个别异步分支，保证异常不被静默吞掉。
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
