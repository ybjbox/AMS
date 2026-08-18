/**
 * 保存/写操作失败的统一描述逻辑（纯函数，无副作用，便于单测）。
 *
 * 背景：api.ts 拦截器对 4xx/5xx 直接 reject `error.response.data`（形如 { error: "..." }，
 * 没有 response/status 字段）；401 的 data 形如 { error, code: "UNAUTHENTICATED" | "SESSION_EXPIRED" }；
 * 网络错误则是 AxiosError（message: "Network Error"，无 response）。
 * 因此错误体可能是 { error } / { message } / 原生 Error / 网络错误对象，需要统一解析。
 */

export function describeSaveError(error: unknown, fallback = '保存失败，请稍后重试'): string {
  if (error && typeof error === 'object') {
    const e = error as { error?: unknown; message?: unknown };
    // 后端业务错误（4xx/5xx）：统一返回 { error: "..." }
    if (typeof e.error === 'string' && e.error.trim().length > 0) return e.error;
    // ApiErrorResponse 形态：{ message: "..." }
    if (typeof e.message === 'string' && e.message.trim().length > 0) return e.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

/**
 * 这类错误 api.ts 拦截器已经弹过通用提示（网络错误 / 401 登录失效并跳转），
 * 这里就不再重复弹 toast，只写通知中心。
 *
 * 关键：api.ts 对 4xx/5xx 直接 reject `error.response.data`（形如 { error: "..." }），
 * 那是**纯对象**，没有 isAxiosError / response / code 字段 —— 必须被当作「业务错误」并弹 toast。
 * 真正「已被全局处理」的只有两类：
 *   1) 网络/超时：原始 AxiosError，带 isAxiosError: true（api.ts 对它 reject 的是 error 本身）；
 *   2) 401 登录失效：reject 值带 code: "UNAUTHENTICATED" | "SESSION_EXPIRED"。
 */
export function isNetworkOrAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { isAxiosError?: unknown; code?: unknown };
  if (e.code === 'UNAUTHENTICATED' || e.code === 'SESSION_EXPIRED') return true; // 401 登录失效
  if (e.isAxiosError === true) return true; // 网络层错误（含超时），全局已弹「网络请求失败」
  return false;
}
