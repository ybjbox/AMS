import { describe, it, expect } from 'vitest';
import type { User } from '@/types';
import {
  buildLabelPrintHtml,
  buildContactCardPrintHtml,
  buildRosterPrintHtml,
  buildAddressBookPrintHtml,
} from './printHtml';

/** 模拟通过 POST /api/users 写入的恶意字段（P2-1 攻击载荷）。 */
const maliciousUser = {
  id: '1',
  name: '<img src=x onerror=alert(1)>',
  department: '<svg/onload=alert(2)>',
  role: '<script>alert(3)</script>',
  phone: '"><script>alert(4)</script>',
} as unknown as User;

describe('buildLabelPrintHtml (P2-1 档案标签打印)', () => {
  const html = buildLabelPrintHtml(maliciousUser);

  it('所有用户字段被转义，不出现可执行的原始标签', () => {
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;svg/onload=alert(2)&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;');
    // 关键：不能出现可被解析执行的原始标签
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<svg');
  });

  it('保留合法标签结构与标题', () => {
    expect(html).toContain('<div class="label-container">');
    expect(html).toContain('打印档案标签');
  });
});

describe('buildContactCardPrintHtml (P2-1 联系卡打印)', () => {
  it('name 被转义，bodyHtml 透传（React 已转义）', () => {
    const html = buildContactCardPrintHtml(maliciousUser.name, '<div>body</div>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('<div>body</div>');
  });
});

describe('buildRosterPrintHtml / buildAddressBookPrintHtml', () => {
  const opts = { title: '<b>标题</b>', paperSize: 'A4', orientation: 'landscape', isDoubleSided: true };

  it('title 被转义，双面模式输出双面 margin', () => {
    const html = buildRosterPrintHtml('<table></table>', opts);
    expect(html).toContain('&lt;b&gt;标题&lt;/b&gt;');
    expect(html).not.toContain('<b>标题</b>');
    expect(html).toContain('@page :left');
  });

  it('单面模式不输出双面 margin，title 被转义', () => {
    const html = buildAddressBookPrintHtml('<table></table>', { ...opts, isDoubleSided: false });
    expect(html).not.toContain('@page :left');
    expect(html).toContain('&lt;b&gt;标题&lt;/b&gt;');
    expect(html).not.toContain('<b>标题</b>');
  });
});
