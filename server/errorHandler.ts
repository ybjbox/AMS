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
  const message = errMessage(err) || "服务器内部错误";

  // 5xx 一律落日志，便于排查；4xx（如校验/zod 透传）通常无需堆栈。
  if (status >= 500) {
    console.error("[error-handler] 未捕获异常：", err);
  }

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
};

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
