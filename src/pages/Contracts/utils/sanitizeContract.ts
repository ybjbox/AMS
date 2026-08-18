import DOMPurify from 'dompurify';
import { sanitizeStyleAttribute } from '@/utils/sanitizeStyle';

// 在 DOMPurify 既有 style 清洗（剔除 url()/expression 等）之后，
// 再用安全 CSS 属性白名单二次收敛，消除视觉欺骗路径（AUDIT P2-2）。
// 钩子只注册一次（模块级单例）。
let hookRegistered = false;
function ensureStyleHook() {
  if (hookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as HTMLElement;
    if (el.hasAttribute && el.hasAttribute('style')) {
      const cleaned = sanitizeStyleAttribute(el.getAttribute('style'));
      if (cleaned) {
        el.setAttribute('style', cleaned);
      } else {
        el.removeAttribute('style');
      }
    }
  });
  hookRegistered = true;
}

/**
 * 清洗合同模板 HTML：去除脚本/事件等危险内容（DOMPurify 原生），
 * 并对 `style` 属性施加安全 CSS 属性白名单（AUDIT P2-2）。
 */
export function sanitizeContractHtml(html: string): string {
  ensureStyleHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'p', 'div', 'span', 'br',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'strong', 'em', 'u', 'ol', 'ul', 'li', 'hr',
    ],
    ALLOWED_ATTR: ['style', 'class', 'colspan', 'rowspan'],
  });
}
