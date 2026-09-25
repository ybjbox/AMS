import { describe, it, expect } from 'vitest';
import {
  buildVoucherHtml,
  DATE_BLANK,
  DEFAULT_SPEC,
  findOverlap,
  formatRecordRange,
  HANDWRITE_BLANK_MM,
  layoutFacts,
  nextStartNo,
  PERIOD_BASE_FONT_PT,
  PERIOD_MIN_FONT_PT,
  printableWidthMm,
  toPrintRecord,
  voucherDateText,
  voucherNumbers,
  voucherPages,
  voucherRanges,
  type VoucherPrintRecord,
  type VoucherSpec,
} from '../voucher';

const spec = (over: Partial<VoucherSpec>): VoucherSpec => ({ ...DEFAULT_SPEC, ...over });

/**
 * 编号是餐券唯一「错了就作废」的部分，两种号段模式都要钉住。
 * 母版（工作餐券v1.xlsx）是双列 × 每列 50 张、右列整体偏移 50，
 * 左列 1200..1249、右列 1250..1299 —— 打印时是按列裁开，不是按行。
 */
describe('voucherNumbers', () => {
  it('分列号段：第 c 列整体偏移 c×每列张数（Excel 母版口径）', () => {
    const out = voucherNumbers(spec({ startNo: 1200, count: 6, cols: 2, perCol: 50 }));
    expect(out).toEqual([
      'NO.1200', 'NO.1250',
      'NO.1201', 'NO.1251',
      'NO.1202', 'NO.1252',
    ]);
  });

  it('逐张连续：按阅读顺序排，跨列不跳号（位数设 1 即不补零）', () => {
    const out = voucherNumbers(
      spec({ startNo: 7, count: 5, cols: 2, perCol: 50, pad: 1, splitByColumn: false })
    );
    expect(out).toEqual(['NO.7', 'NO.8', 'NO.9', 'NO.10', 'NO.11']);
  });

  it('补零只到指定位数，超过位数不截断', () => {
    expect(voucherNumbers(spec({ startNo: 9, count: 2, cols: 1, pad: 4, splitByColumn: false }))).toEqual([
      'NO.0009',
      'NO.0010',
    ]);
    expect(voucherNumbers(spec({ startNo: 99999, count: 1, cols: 1, pad: 4, splitByColumn: false }))).toEqual([
      'NO.99999',
    ]);
  });

  it('张数不满一行时只印实际张数（最后一行留空位给切边）', () => {
    const out = voucherNumbers(spec({ count: 3, cols: 2, splitByColumn: false }));
    expect(out).toHaveLength(3);
  });

  it('单列时两种模式等价', () => {
    const split = voucherNumbers(spec({ count: 4, cols: 1, perCol: 50, splitByColumn: true }));
    const plain = voucherNumbers(spec({ count: 4, cols: 1, perCol: 50, splitByColumn: false }));
    expect(split).toEqual(plain);
  });
});

describe('buildVoucherHtml', () => {
  it('券面文字全部转义，机构名里的 < 不会变成标签', () => {
    const html = buildVoucherHtml(spec({ org: '<img src=x onerror=alert(1)>' }), ['NO.1200']);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('每行的券格数与切断槽数都跟着列数走', () => {
    const html = buildVoucherHtml(spec({ cols: 3, gutterMm: 3 }), ['NO.1', 'NO.2', 'NO.3', 'NO.4']);
    const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    const count = (row: string | undefined, re: RegExp) => (row?.match(re) ?? []).length;
    expect(rows).toHaveLength(2); // 4 张 / 3 列 → 2 行（末行补空位，保持整版栅格）
    expect(count(rows[0], /class="cell"/g)).toBe(3);
    expect(count(rows[0], /class="gut"/g)).toBe(2); // 3 列之间两条，不是四条虚线
    expect(count(rows[1], /class="gut"/g)).toBe(2);
  });

  it('切断槽宽度与 @page 都来自设置（预览与打印同一份 HTML）', () => {
    const html = buildVoucherHtml(spec({ gutterMm: 6 }), ['NO.1']);
    expect(html).toContain('width: 6mm');
    expect(html).toContain('@page { size: 210mm 297mm');
  });
});

/**
 * 母版（E:/办公文件/工作餐券v1.xlsx，模版-1版100张）实测值，用脚本从 xlsx 里读出来后钉在这里：
 * 行高 36.75/42/18/18/18/27.75pt = 12.97/14.82/6.35/6.35/6.35/9.79mm（每券 56.63mm → A4 每列 5 张、10 页 100 张），
 * pageMargins 左 0.1965" 右 0.1569" 上下 0.2361" = 5/4/6/6mm，字体隶书 20/30/13pt 不加粗，
 * 券体左边 thin、右边 thin、顶边 double、底边 double（券与券共用一条双线，行与行之间没有任何线），
 * 切断线只有 F 列右侧一条 dotted（即 5.8mm gap 的正中间）。
 * 实现把双线画在单元格上（3px ≈ 0.79mm），所以说明行取 9mm 换回边框份额，整券仍是 56.63mm、每页 10 张。
 * 这些断言的意义：改版面的人必须是有意识地改，而不是顺手换成"看着差不多"的值。
 */
describe('券面几何钉住母版', () => {
  const html = buildVoucherHtml(spec({}), ['NO.1200', 'NO.1250']);
  const rule = (sel: string) => html.match(new RegExp(`\\n\\s*${sel} \\{([^}]*)\\}`))?.[1] ?? '';

  it('六行高度与字号来自实测，而不是凑整数', () => {
    expect(rule('.org')).toContain('height: 12.97mm');
    expect(rule('.amt')).toContain('height: 14.82mm');
    expect(rule('.no')).toContain('height: 6.35mm');
    expect(rule('.note')).toContain('height: 9mm');
    expect(rule('.org')).toContain('font-size: 20pt');
    expect(rule('.amt')).toContain('font-size: 30pt');
    expect(html).toContain('LiSu');
    expect(html).not.toContain('font-weight: 700');
  });

  it('券体只有外框：上下双线、左右细边，行内没有横线', () => {
    expect(rule('td.cell')).toContain('border-top: 3px double');
    expect(rule('td.cell')).toContain('border-left: 1px solid');
    expect(rule('.r')).not.toContain('border');
    // 末行补一条底线，否则整版最后一张券下沿没有双线
    expect(html).toContain('td.cell.last { border-bottom: 3px double #000; }');
    expect(html).toContain('class="cell last"');
  });

  it('切断线只有一条点线，落在 gap 正中', () => {
    expect(html).toContain('<td class="gut"><span class="cut"></span></td>');
    expect(rule('.cut')).toContain('left: 50%');
    expect(rule('.cut')).toContain('1px dotted');
    expect(rule('td.gut')).not.toContain('border');
  });

  it('页边距按母版（上6 右4 下6 左5mm），一张纸 = 一个定尺寸 sheet', () => {
    // 与会议台卡同一套分页做法：@page 无边距，页边距是 sheet 的 padding
    expect(rule('@page')).toContain('margin: 0');
    expect(rule('.sheet')).toContain('width: 210mm');
    expect(rule('.sheet')).toContain('height: 297mm');
    expect(rule('.sheet')).toContain('padding: 6mm 4mm 6mm 5mm');
    expect(rule('.sheet')).toContain('break-after: page');
    // 纸内内容宽 = 可印宽（210 − 左5 − 右4）
    expect(printableWidthMm('A4')).toBe(201);
  });

  it('按纸张分页：每页 2 列 × 5 张，20 张两页、100 张十页', () => {
    const n = (count: number, over: Partial<VoucherSpec> = {}) =>
      voucherPages(spec(over), Array.from({ length: count }, (_, i) => `NO.${i}`));
    expect(n(20)).toHaveLength(2);
    expect(n(100)).toHaveLength(10);
    expect(n(100)[0]).toHaveLength(10);
    expect(n(12)[1]).toHaveLength(2); // 第二页只有 2 张，不补齐
    expect(n(20, { paperSize: 'A5' })).toHaveLength(4); // A5 可印高 198mm → 每页 2 列 × 3 行 = 6 张
    expect(buildVoucherHtml(spec({}), voucherNumbers(spec({})))).toContain('预览纸张: A4');
  });

  it('占位符是一个中文字符宽（U+3000），够手写又不挤爆整行', () => {
    expect(DATE_BLANK.length).toBe(1);
    expect(DATE_BLANK.codePointAt(0)).toBe(0x3000);
  });

  it('日期段落：填了印数字，空着印占位', () => {
    expect(voucherDateText({ year: '2026', month: '', day: '5' })).toBe(
      `2026年${DATE_BLANK}月5日`
    );
    expect(voucherDateText({ year: '', month: '', day: '' })).toBe(
      `${DATE_BLANK}年${DATE_BLANK}月${DATE_BLANK}日`
    );
    // 只取数字、按位截断：粘进来的「2o26年」不会印成乱码，多余的位直接丢掉
    expect(voucherDateText({ year: '2o26年', month: '13', day: '999' })).toBe('226年13月99日');
  });

  it('券面把占位段落排成带下划线的填空', () => {
    const withBlanks = buildVoucherHtml(
      spec({
        periodFrom: { year: '2026', month: '', day: '' },
        periodTo: { year: '2026', month: '3', day: '1' },
      }),
      ['NO.1']
    );
    const blank = `<span class="fill blank">${DATE_BLANK}</span>`;
    expect(withBlanks).toContain(`2026年${blank}月${blank}日-2026年3月1日`);
    expect(rule('.fill')).toContain('underline');
    // 占位定宽：整行缩字号时手写空间不跟着缩
    expect(rule('.blank')).toContain('display: inline-block');
    expect(rule('.blank')).toContain(`width: ${HANDWRITE_BLANK_MM}mm`);
  });

  it('默认设置就是母版那一版：双列、每列 50 张、4 位号、分列号段', () => {
    expect(DEFAULT_SPEC).toMatchObject({ cols: 2, perCol: 50, pad: 4, splitByColumn: true });
    expect(DEFAULT_SPEC.gutterMm).toBe(6);
    expect(DEFAULT_SPEC.paperSize).toBe('A4');
    expect(voucherNumbers(DEFAULT_SPEC).slice(0, 2)).toEqual(['NO.1200', 'NO.1250']);
  });
});

/** 纸张决定 @page、预览宽度与每页张数；预览必须与所选纸张一致，不能永远按 A4 出图。 */
describe('纸张与版面事实', () => {
  const htmlFor = (over: Partial<VoucherSpec>) => buildVoucherHtml(spec(over), ['NO.1']);

  it('默认 A4：券宽 97.5mm、每页 2 列 × 5 张、20 张两页', () => {
    expect(layoutFacts(spec({}))).toMatchObject({
      voucherWidthMm: 97.5,
      rowsPerPage: 5,
      perPage: 10,
      pages: 2,
      tooNarrow: false,
    });
  });

  it('@page 与 sheet 尺寸都跟着纸张走（预览就是一张张纸）', () => {
    const html = htmlFor({ paperSize: 'A5' });
    expect(html).toContain('@page { size: 148mm 210mm');
    expect(html).toContain('width: 148mm');
    expect(html).toContain('height: 210mm');
    expect(html).toContain('预览纸张: A5 (148x210mm)');
  });

  it('认不出的纸张退回 A4，不会排出 0mm 版面', () => {
    expect(htmlFor({ paperSize: 'nonsense' })).toContain('@page { size: 210mm 297mm');
  });

  it('每页行数按整券高排，不留半张', () => {
    expect(layoutFacts(spec({ paperSize: 'B5' })).rowsPerPage).toBe(4); // (250−12)/56.63 = 4.2
    expect(layoutFacts(spec({ paperSize: 'A5' })).rowsPerPage).toBe(3); // (210−12)/56.63 = 3.5
  });

  it('A5 双列放不下 21 字的长句时如实报警，改单列即可', () => {
    const twoCol = layoutFacts(spec({ paperSize: 'A5' }));
    expect(twoCol.tooNarrow).toBe(true);
    expect(twoCol.longestLineMm).toBeGreaterThan(twoCol.voucherWidthMm);
    // 券宽 66.5mm：使用时间行缩到下限也放不下
    expect(twoCol.periodTooWide).toBe(true);
    const oneCol = layoutFacts(spec({ paperSize: 'A5', cols: 1 }));
    expect(oneCol.tooNarrow).toBe(false);
    expect(oneCol.periodTooWide).toBe(false);
  });

  it('A4 默认（母版形态）整行放得下，保持 13pt 不缩', () => {
    const a4 = layoutFacts(spec({}));
    expect(a4.periodFontPt).toBe(PERIOD_BASE_FONT_PT);
    expect(a4.periodTooWide).toBe(false);
    expect(buildVoucherHtml(spec({}), ['NO.1'])).toContain('.period { font-size: 13pt; }');
  });

  it('券宽不够时只缩使用时间这一行，且不低于可读下限', () => {
    const b5 = layoutFacts(spec({ paperSize: 'B5' })); // 券宽 80.5mm
    expect(b5.periodFontPt).toBeLessThan(PERIOD_BASE_FONT_PT);
    expect(b5.periodFontPt).toBeGreaterThanOrEqual(PERIOD_MIN_FONT_PT);
    expect(b5.periodTooWide).toBe(false);
    // 其余四行的字号不受影响
    expect(buildVoucherHtml(spec({ paperSize: 'B5' }), ['NO.1'])).toContain('.org { height: 12.97mm; line-height: 12.97mm; font-size: 20pt');
  });
});

/** 打印台账：防的就是"同一批号印两次"，所以号段与接续号必须算准。 */
describe('打印台账与号段重叠', () => {
  const recOf = (over: Partial<VoucherSpec>): VoucherPrintRecord => ({
    ...toPrintRecord(spec(over), new Date('2026-09-25T08:00:00.000Z')),
    id: `r-${over.startNo ?? 1200}-${over.count ?? 20}`,
  });

  it('分列号段按列拆成两段，逐张连续合成一段', () => {
    expect(voucherRanges(spec({ count: 20 }))).toEqual([
      { from: 1200, to: 1209 },
      { from: 1250, to: 1259 },
    ]);
    expect(voucherRanges(spec({ count: 20, splitByColumn: false }))).toEqual([
      { from: 1200, to: 1219 },
    ]);
  });

  it('接续号 = 最靠后那批的"起始号 + 张数"', () => {
    const one = recOf({ count: 20 });
    expect(nextStartNo([one], 1200)).toBe(1220);
    expect(nextStartNo([one, recOf({ startNo: 1220, count: 30 })], 1200)).toBe(1250);
    expect(nextStartNo([], 1200)).toBe(1200);
  });

  it('重叠判定只看实际号段：正好接上不算撞，差一张算撞', () => {
    const one = recOf({ count: 20 });
    expect(findOverlap(spec({ count: 20 }), [one])).toBe(one);
    expect(findOverlap(spec({ count: 20, startNo: 1220 }), [one])).toBeNull();
    expect(findOverlap(spec({ count: 11, startNo: 1209 }), [one])).toBe(one);
    expect(findOverlap(spec({ count: 20, startNo: 1259 }), [one])).toBe(one); // 撞右列
    expect(findOverlap(spec({ count: 20 }), [])).toBeNull();
  });

  it('脏记录（没有 ranges）不炸判定，也不误报', () => {
    const dirty = { id: 'x', at: '2026-09-25', startNo: 1200, count: 20 } as unknown as VoucherPrintRecord;
    expect(findOverlap(spec({}), [dirty])).toBeNull();
    expect(formatRecordRange(dirty, 4)).toBe('');
  });

  it('台账摘要按当前位数显示号段', () => {
    expect(formatRecordRange(recOf({ count: 20 }), 4)).toBe('1200-1209、1250-1259');
  });
});
