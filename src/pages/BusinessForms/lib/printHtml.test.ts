import { describe, it, expect } from 'vitest';
import { buildFormPrintHtml, buildFormSheetCss, buildFormSheetHtml } from './printHtml';
import type { BusinessForm } from './templates';

const form: BusinessForm = {
  kind: 'condolence',
  department: '集团办公室',
  name: '杨新宇',
  date: '2026-08-24',
  relation: '父亲',
  amount: 501,
  body: '根据集团规章制度规定，集团办公室员工杨新宇，因其父亲不幸离世……\n呈上级领导批示。\n户名：某某单位',
};

describe('打印版面 HTML', () => {
  it('含标题、日期行、五栏表格与正文段落', () => {
    const html = buildFormSheetHtml(form);
    expect(html).toContain('业务单');
    expect(html).toContain('需办理的业务');
    expect(html).toContain('董事长批示');
    expect(html.match(/<tr>/gu)).toHaveLength(5);
    expect(html).toContain('<b>杨新宇</b>');
    // 收款信息行取消首行缩进
    expect(html).toContain('<p class="ywd-flush">户名：某某单位</p>');
  });

  it('所有用户输入均经转义，不注入脚本', () => {
    const evil = { ...form, name: '<script>alert(1)</script>', department: '" onload=x' };
    const html = buildFormSheetHtml(evil);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot; onload=x');
  });

  it('跨列单元格带 colspan，六列网格由 colgroup 显式定型（避免 fixed 布局均分余量）', () => {
    const html = buildFormSheetHtml(form);
    expect(html.match(/colspan="\d+"/gu)).toHaveLength(6);
    expect(html).toContain('<colgroup><col style="width:38.10mm"><col style="width:50.80mm"><col style="width:6.35mm"><col style="width:25.40mm"><col style="width:6.35mm"><col style="width:50.80mm"></colgroup>');
  });

  it('行高按 Word docGrid 吸附还原（正文/栏目 2 格 = 31.2pt，日期 1 格 = 15.6pt）', () => {
    const css = buildFormSheetCss();
    expect(css).toMatch(/\.ywd-body\{[^}]*line-height:31\.2pt/u);
    expect(css).toMatch(/\.ywd-label\{[^}]*line-height:31\.2pt/u);
    expect(css).toMatch(/\.ywd-date\{[^}]*line-height:15\.6pt/u);
    // 回归：曾因 pt() 被二次换算得到 1.6pt 行高，正文各行叠在一起
    expect(css).not.toMatch(/line-height:[12]\.\d pt|line-height:1\.\d+pt/u);
  });

  it('打印文档带 A4 @page 且边距为 0（版面自带页边距）', () => {
    const doc = buildFormPrintHtml(form);
    expect(doc).toMatch(/@page\{size:210\.\d\dmm 297\.\d\dmm;margin:0\}/u);
    expect(doc).toContain('<table class="ywd-table"');
  });
});
