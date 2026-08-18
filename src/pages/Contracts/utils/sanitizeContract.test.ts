import { describe, it, expect } from 'vitest';
import { sanitizeContractHtml } from './sanitizeContract';

describe('sanitizeContractHtml (AUDIT P2-2 端到端)', () => {
  it('DOMPurify 原生拦截脚本与事件处理器', () => {
    const out = sanitizeContractHtml(
      '<p onclick="alert(1)">hi</p><script>alert(2)</script><img src=x onerror="alert(3)">'
    );
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).toContain('hi');
  });

  it('合同模板中的 style 被收敛到安全白名单（剔除视觉欺骗属性）', () => {
    const template = `
      <h1 style="color:white; font-size:24px; text-align:center;">劳动合同</h1>
      <p style="display:none;">试用期6个月（被隐藏）</p>
      <div style="position:absolute; z-index:999; font-size:0;">伪造条款</div>
      <table style="border:1px solid #ccc; width:100%;"><tr><td style="text-align:right; font-weight:bold;">姓名</td></tr></table>
    `;
    const out = sanitizeContractHtml(template);
    // 欺骗属性被剔除
    expect(out).not.toContain('color:white');
    expect(out).not.toContain('display:none');
    expect(out).not.toContain('position:absolute');
    expect(out).not.toContain('z-index:999');
    expect(out).not.toContain('font-size:0');
    // 合法呈现属性保留
    expect(out).toContain('text-align:center');
    expect(out).toContain('font-size:24px');
    expect(out).toContain('border:1px solid #ccc');
    expect(out).toContain('width:100%');
    expect(out).toContain('text-align:right');
    expect(out).toContain('font-weight:bold');
    // 内容文本仍在（未被删除，仅隐藏性 style 被剥）
    expect(out).toContain('试用期6个月');
    expect(out).toContain('伪造条款');
  });

  it('保留正常排版的合同样式（无回归）', () => {
    const template = '<h2 style="text-align:center; font-size:18px;">保密协议</h2>';
    const out = sanitizeContractHtml(template);
    expect(out).toContain('text-align:center');
    expect(out).toContain('font-size:18px');
    expect(out).toContain('保密协议');
  });
});
