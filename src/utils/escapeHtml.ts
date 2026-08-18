/**
 * HTML 输出编码（防 XSS）。
 *
 * 任何要拼进 document.write() / innerHTML 的用户可控字段，都必须先经过本函数。
 * 覆盖 5 个关键字符：& < > " '。
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
