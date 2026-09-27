import { describe, it, expect } from 'vitest';
import { buildFormPrintHtml, buildFormSheetCss, buildFormSheetHtml } from './printHtml';
import { BLANK_FORM, planSheets, type SheetSlot } from './sheetLayout';
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

const slots = (...fs: BusinessForm[]): SheetSlot[] => fs.map((f) => ({ form: f, blank: false }));
const blankSlot = (): SheetSlot => ({ form: BLANK_FORM, blank: true });
const slotCount = (html: string) => html.match(/class="ywd-slot"/gu)?.length ?? 0;

describe('打印版面 HTML', () => {
  it('含标题、日期行、五栏表格与正文段落', () => {
    const html = buildFormSheetHtml(slots(form));
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
    const html = buildFormSheetHtml(slots(evil));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot; onload=x');
  });

  it('跨列单元格带 colspan，六列网格由 colgroup 显式定型（避免 fixed 布局均分余量）', () => {
    const html = buildFormSheetHtml(slots(form));
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
    const doc = buildFormPrintHtml([slots(form)]);
    expect(doc).toMatch(/@page\{size:210\.\d\dmm 297\.\d\dmm;margin:0\}/u);
    expect(doc).toContain('<table class="ywd-table"');
  });

  it('多条 = 多张纸，第二张起强制换页（不能靠"正好 297mm"猜分页边界）', () => {
    const doc = buildFormPrintHtml(planSheets([form, form, form]).sheets);
    expect(doc.match(/class="ywd-page"/gu)).toHaveLength(2);
    const css = buildFormSheetCss();
    expect(css).toMatch(/\.ywd-page \+ \.ywd-page\{[^}]*break-before:\s*page/u);
    expect(css).toMatch(/page-break-before:\s*always/u);
  });

  it('一张纸两条：同一张上上下两个槽位，各排各的内容', () => {
    const html = buildFormSheetHtml(slots(form, { ...form, name: '林思婷', department: '财务部' }));
    expect(slotCount(html)).toBe(2);
    expect(html.match(/<tr>/gu)).toHaveLength(10);
    expect(html).not.toContain('data-blank');
    expect(html).toContain('<b>杨新宇</b>');
    expect(html).toContain('林思婷');
    expect(html).toContain('财务部');
  });

  it('尾格补的空白单只有骨架：栏目名在，别人的内容一个都没有', () => {
    const html = buildFormSheetHtml([...slots(form), blankSlot()]);
    expect(slotCount(html)).toBe(2);
    expect(html.match(/data-blank="true"/gu)).toHaveLength(1);
    const tail = html.slice(html.indexOf('data-blank="true"'));
    expect(tail).not.toContain('杨新宇');
    expect(tail).not.toContain('集团办公室');
    expect(tail).not.toMatch(/<div class="ywd-date">[^<]/u);
    // 栏目名照旧，才写得下手
    for (const label of ['部 门', '姓 名', '需办理的业务', '董事长批示']) {
      expect(tail.match(new RegExp(label, 'gu'))).toHaveLength(1);
    }
  });

  it('版面按 planSheets 给的格数排，并标出这张纸几格（两格才定高）', () => {
    const one = buildFormSheetHtml(planSheets([form]).sheets[0]);
    const two = buildFormSheetHtml(planSheets([form, form]).sheets[0]);
    const solo = buildFormSheetHtml(planSheets([{ ...form, body: '一'.repeat(900) }]).sheets[0]);
    // 一条 → 上半格内容 + 下半格空白单；两条 → 铺满；超高的那条独占一张、不补空白单
    expect([slotCount(one), slotCount(two), slotCount(solo)]).toEqual([2, 2, 1]);
    expect(one).toContain('data-slots="2"');
    expect(solo).toContain('data-slots="1"');
  });

  it('横向居中：整块收成表格宽并居中，日期右对齐到表格右边往里 575 twips', () => {
    const css = buildFormSheetCss();
    // 槽位居中靠 align-items，块宽=表格宽=177.80mm（纸宽 210.01mm，左右各留 16.10mm）
    expect(css).toMatch(/\.ywd-slot\{[^}]*align-items:center/u);
    expect(css).toMatch(/\.ywd-block\{[^}]*width:177\.80mm[^}]*margin:auto 0/u);
    expect(css).toMatch(/\.ywd-table\{[^}]*width:177\.80mm;[^}]*margin:0/u);
    expect(css).toMatch(/\.ywd-date\{[^}]*margin:0 10\.14mm 0 0[^}]*text-align:right/u);
    expect(css).toMatch(/\.ywd-date\{[^}]*min-height:15\.6pt/u);
    // 旧口径（表格绝对左偏移 + 前导空格居中）不能回来，否则两条时各自偏右、日期还会飘
    expect(css).not.toMatch(/margin-left:20\.\d+mm/u);
    expect(css).not.toMatch(/\.ywd-date\{[^}]*white-space:pre/u);
  });

  it('两格定高半页：分界线锁在 A4 对折线上，对折一刀裁得开（一高一矮也不会漂）', () => {
    const css = buildFormSheetCss();
    expect(css).toMatch(
      /\.ywd-page\[data-slots="2"\] \.ywd-slot\{[^}]*flex:0 0 auto;[^}]*height:140\.49mm/u
    );
    // 半页 140.49 × 2 + 上下页边距 8.01 × 2 = 297.0 ≈ 整页；折线 = 8.01 + 140.49 = 148.5
    expect(140.49 * 2 + 8.01 * 2).toBeCloseTo(297.03, 1);
    expect(8.01 + 140.49).toBeCloseTo(297.03 / 2, 1);
  });
});
