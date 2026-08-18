/**
 * 生成唯一 ID。
 *
 * 优先使用 `crypto.randomUUID()`（安全上下文：localhost / https），与 server 端 ID 生成约定保持一致，
 * 避免原先 `Math.random().toString(36).substring(7)` 的碰撞风险。
 * 非安全上下文（如局域网 http 访问）下 `crypto.randomUUID` 可能未定义，退回到「时间戳 + 随机串」，
 * 保证调用不抛错且实际碰撞概率极低。
 */
export function genId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
