import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../escapeHtml';

describe('escapeHtml', () => {
  it('转义 5 个关键字符 & < > " \'', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('阻断存储型 XSS 载荷（P2-1 核心场景）', () => {
    const payload = `<img src=x onerror=alert(1)>`;
    const out = escapeHtml(payload);
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
  });

  it('null / undefined 返回空串', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('数字等非字符串被转成字符串', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml('')).toBe('');
  });
});
