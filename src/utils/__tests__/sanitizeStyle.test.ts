import { describe, it, expect } from 'vitest';
import { sanitizeStyleAttribute } from '../sanitizeStyle';

describe('sanitizeStyleAttribute (AUDIT P2-2)', () => {
  it('保留白名单内的排版/间距/边框属性', () => {
    const raw =
      'font-size:18px; text-align:center; font-weight:bold; margin:5px; padding:2px; border:1px solid #ccc; line-height:1.5; letter-spacing:1px';
    const out = sanitizeStyleAttribute(raw);
    expect(out).toContain('font-size:18px');
    expect(out).toContain('text-align:center');
    expect(out).toContain('font-weight:bold');
    expect(out).toContain('margin:5px');
    expect(out).toContain('padding:2px');
    expect(out).toContain('border:1px solid #ccc');
    expect(out).toContain('line-height:1.5');
    expect(out).toContain('letter-spacing:1px');
  });

  it('剔除可用于视觉欺骗的属性：color / background / display / visibility / opacity', () => {
    const raw =
      'color:white; background:#fff; display:none; visibility:hidden; opacity:0; font-size:16px';
    const out = sanitizeStyleAttribute(raw);
    expect(out).not.toContain('color');
    expect(out).not.toContain('background');
    expect(out).not.toContain('display');
    expect(out).not.toContain('visibility');
    expect(out).not.toContain('opacity');
    // 但合法属性保留
    expect(out).toContain('font-size:16px');
  });

  it('剔除定位/叠层/裁剪类属性：position / z-index / height / overflow / transform / float', () => {
    const raw =
      'position:absolute; z-index:999; height:0; overflow:hidden; transform:scale(0); float:left; text-align:right';
    const out = sanitizeStyleAttribute(raw);
    expect(out).not.toContain('position');
    expect(out).not.toContain('z-index');
    expect(out).not.toContain('height');
    expect(out).not.toContain('overflow');
    expect(out).not.toContain('transform');
    expect(out).not.toContain('float');
    expect(out).toContain('text-align:right');
  });

  it('剔除含 url() / expression() / javascript: 的声明，但保留白名单内合法属性', () => {
    const raw =
      "background:url('javascript:alert(1)'); width:100px; x:expression(alert(1)); filter:url(data:image/svg+xml,...)";
    const out = sanitizeStyleAttribute(raw);
    expect(out).not.toMatch(/url\s*\(/i);
    expect(out).not.toMatch(/expression/i);
    // width 在白名单且非欺骗，应保留
    expect(out).toContain('width:100px');
  });

  it('白名单属性即使混合欺骗属性也不受影响（回归防御）', () => {
    const raw = 'font-size:0; color:white; display:none; text-align:center';
    const out = sanitizeStyleAttribute(raw);
    // font-size:0 / color / display 均被剔除，仅剩 text-align
    expect(out).toBe('text-align:center');
  });

  it('剔除 font-size:0 / line-height:0 等零值隐藏手段', () => {
    const raw = 'font-size:0px; line-height:0; font-size:14px; text-align:center';
    const out = sanitizeStyleAttribute(raw);
    expect(out).not.toContain('font-size:0');
    expect(out).not.toContain('line-height:0');
    expect(out).toContain('font-size:14px');
    expect(out).toContain('text-align:center');
  });

  it('空值 / 非法输入安全降级为空串', () => {
    expect(sanitizeStyleAttribute('')).toBe('');
    expect(sanitizeStyleAttribute(null as unknown as string)).toBe('');
    expect(sanitizeStyleAttribute(undefined as unknown as string)).toBe('');
    expect(sanitizeStyleAttribute('   ')).toBe('');
    // 无冒号的非法声明被忽略
    expect(sanitizeStyleAttribute('not-a-declaration')).toBe('');
  });

  it('大小写不敏感匹配属性名', () => {
    const out = sanitizeStyleAttribute('FONT-WEIGHT:bold; TEXT-ALIGN:left');
    expect(out).toContain('font-weight:bold');
    expect(out).toContain('text-align:left');
  });
});
