/**
 * 独立打印文档骨架构造（第 10 批）。
 *
 * 这批要修的是「排座/台卡打印出空白纸」：全局 `@media print { #root > * {display:none} }`
 * 把祖先隐藏了，后代的 print: 变体救不回来。修法是连同样式表把已渲染的子树搬进独立文档，
 * 所以这里断言的是「样式与子树都带上了、且没有把主文档的 #root 隐藏规则搬过来」。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { collectDocumentStyles, composeReactPrintHtml } from '../printWindow';

function addStyle(css: string, where: 'head' | 'body' = 'head') {
  const el = document.createElement('style');
  el.textContent = css;
  (where === 'head' ? document.head : document.body).appendChild(el);
  return el;
}

beforeEach(() => {
  document.head.querySelectorAll('style').forEach((n) => n.remove());
  document.body.querySelectorAll('style').forEach((n) => n.remove());
  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
});

describe('collectDocumentStyles', () => {
  it('head 与 body 里的 style、以及外链样式表都收进来', () => {
    addStyle('.a{color:red}');
    addStyle('.nc-print{color:blue}', 'body');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/index.css';
    document.head.appendChild(link);

    const styles = collectDocumentStyles();
    expect(styles).toContain('color:red');
    expect(styles).toContain('color:blue');
    expect(styles).toContain('/assets/index.css');
  });

  it('不把脚本带进打印文档', () => {
    const script = document.createElement('script');
    script.textContent = 'window.__pwn=1';
    document.head.appendChild(script);
    expect(collectDocumentStyles()).not.toContain('__pwn');
    script.remove();
  });
});

describe('composeReactPrintHtml', () => {
  it('样式、打印骨架规则与子树依次就位', () => {
    addStyle('@media print{.print\\:flex{display:flex}}');
    const html = composeReactPrintHtml('<div id="cards">1号桌</div>', collectDocumentStyles(), '.x{top:0}');
    expect(html).toContain('@media print{.print\\:flex{display:flex}}');
    expect(html).toContain('@page { size: A4; margin: 0; }');
    expect(html).toContain('<div id="cards">1号桌</div>');
    expect(html).toContain('.x{top:0}');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('主文档那条 #root 隐藏规则不再存在（它正是空白纸的成因）', () => {
    const html = composeReactPrintHtml('<div>x</div>', collectDocumentStyles());
    expect(html).not.toMatch(/#root\s*>\s*\*[^}]*display:\s*none/i);
  });
});
