import { describe, it, expect } from 'vitest';
import { voucherNumbers, buildVoucherHtml, DEFAULT_SPEC, type VoucherSpec } from '../voucher';

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
    expect(html).toContain('@page { size: A4 portrait');
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

  it('页边距按母版（上6 右4 下6 左5mm），正文宽锁定为可印宽', () => {
    expect(rule('@page')).toContain('margin: 6mm 4mm 6mm 5mm');
    // 210 − 左5 − 右4：预览与打印同宽，长句不会在预览里假性被裁
    expect(rule('body')).toContain('width: 201mm');
  });

  it('日期里的连续空格渲染成下划线填空（母版口径）', () => {
    const withBlanks = buildVoucherHtml(spec({ period: '使用时间：2026年  月  日' }), ['NO.1']);
    expect(withBlanks).toContain('<span class="fill">  </span>月');
    expect(rule('.fill')).toContain('underline');
  });

  it('默认设置就是母版那一版：双列、每列 50 张、4 位号、分列号段', () => {
    expect(DEFAULT_SPEC).toMatchObject({ cols: 2, perCol: 50, pad: 4, splitByColumn: true });
    expect(DEFAULT_SPEC.gutterMm).toBe(6);
    expect(voucherNumbers(DEFAULT_SPEC).slice(0, 2)).toEqual(['NO.1200', 'NO.1250']);
  });
});
