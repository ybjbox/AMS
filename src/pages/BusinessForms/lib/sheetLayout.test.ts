import { describe, it, expect } from 'vitest';
import { LAYOUT, twip } from './layout';
import {
  BLANK_FORM,
  BODY_USABLE_W,
  MIN_BLOCK_H,
  PAGE_INNER_H,
  SLOT_H,
  SLOTS_PER_PAGE,
  blockHeight,
  bodyLines,
  planSheets,
  type SheetSlot,
} from './sheetLayout';
import { buildBody, type BusinessForm } from './templates';

const base: BusinessForm = {
  kind: 'condolence',
  department: '集团办公室',
  name: '林思婷',
  date: '2026-08-24',
  relation: '父亲',
  amount: 501,
  body: '',
};

const mmOf = (twips: number) => `${twip(twips).toFixed(1)}mm`;
/** 一张纸上的排布写成「内容/空白」序列，断言读起来一眼能看懂 */
const shape = (sheet: SheetSlot[]) => sheet.map((s) => (s.blank ? '空白' : s.form.name)).join('+');
/** n 行短正文（每行一行装得下） */
const lines = (n: number) => Array.from({ length: n }, (_, i) => `第${i + 1}行`).join('\n');
const plan = (...names: string[]) => planSheets(names.map((name) => ({ ...base, name })));

describe('一张纸上下两格的排版判定', () => {
  it('骨架高度就是原件那张单：122.0mm，两格叠得下 281.0mm 的纸张内框', () => {
    expect(PAGE_INNER_H).toBe(15930);
    expect(SLOTS_PER_PAGE).toBe(2);
    expect(MIN_BLOCK_H).toBe(6917);
    expect(mmOf(MIN_BLOCK_H)).toBe('122.0mm');
    expect(mmOf(PAGE_INNER_H)).toBe('281.0mm');
    expect(SLOT_H).toBe(7965);
    expect(mmOf(SLOT_H)).toBe('140.5mm');
    expect(blockHeight(BLANK_FORM)).toBe(MIN_BLOCK_H);
  });

  it('两格的分界线正好是 A4 的对折线（对折一刀就能裁开）', () => {
    // 上下页边距对称 → 第一格底边 = 页高的一半，误差 0
    expect(LAYOUT.marginTop + SLOT_H).toBe(LAYOUT.pageH / 2);
    expect(mmOf(LAYOUT.marginTop + SLOT_H)).toBe('148.5mm');
  });

  it('连续排版：第 1、2 条同纸，第 3 条起下一张，尾格补空白单', () => {
    expect(plan('甲', '乙', '丙').sheets.map(shape)).toEqual(['甲+乙', '丙+空白']);
    expect(plan('甲', '乙', '丙').oversized).toEqual([]);
    expect(plan('甲', '乙', '丙').itemCount).toBe(3);
  });

  it('只有一条时也用上半格，下半格打一张空白单（不是整页居中）', () => {
    const p = plan('甲');
    expect(p.sheets.map(shape)).toEqual(['甲+空白']);
    expect(p.sheets[0][0].blank).toBe(false);
    expect(p.sheets[0][1].blank).toBe(true);
  });

  it('偶数条正好铺满，一张空白单都不打', () => {
    expect(plan('甲', '乙').sheets.map(shape)).toEqual(['甲+乙']);
    expect(plan('甲', '乙', '丙', '丁').sheets.map(shape)).toEqual(['甲+乙', '丙+丁']);
    expect(planSheets([]).sheets).toEqual([]);
  });

  it('内置模板的正文照常两条一张（原尺寸不缩放）', () => {
    const form = { ...base, body: buildBody(base) };
    const p = planSheets([form, form]);
    expect(bodyLines(form.body)).toBeLessThanOrEqual(6);
    expect(p.sheets).toHaveLength(1);
    expect(p.oversized).toEqual([]);
  });

  it('一行 = 2 格行距：6 行仍装得下一格，7 行开始只能独占一张', () => {
    expect(bodyLines(lines(6))).toBe(6);
    expect(planSheets([{ ...base, body: lines(6) }]).sheets.map(shape)).toEqual(['林思婷+空白']);

    const p = planSheets([{ ...base, name: '甲', body: lines(7) }, { ...base, name: '乙' }]);
    expect(p.sheets.map(shape)).toEqual(['甲', '乙+空白']);
    // 独占一张的那张不再补空白单：补了就溢出成第二页，凭空多一张纸
    expect(p.oversized).toEqual([{ no: 1, lines: 7 }]);
  });

  it('装不下的条目把自己那一格让出来，后面的条目照常配对', () => {
    const items = [
      { ...base, name: '甲' },
      { ...base, name: '乙', body: lines(9) },
      { ...base, name: '丙' },
      { ...base, name: '丁' },
    ];
    const p = planSheets(items);
    expect(p.sheets.map(shape)).toEqual(['甲+空白', '乙', '丙+丁']);
    expect(p.oversized).toEqual([{ no: 2, lines: 9 }]);
  });

  it('整段长文按可用宽度折行来数行数', () => {
    // 正文格跨 5 列：7920 - 左右单元格边距 - 边框
    expect(BODY_USABLE_W).toBe(7684);
    const full = (n: number) => '一'.repeat(n);
    // 首行要少放一个缩进量（480 twips），所以第一行只装得下 30 个全角字
    expect(bodyLines(full(30))).toBe(1);
    expect(bodyLines(full(31))).toBe(2);
    expect(bodyLines(full(62))).toBe(2);
    expect(bodyLines(full(63))).toBe(3);
    // 收款信息行不缩进，第一行能放到 32 个全角字（户名：占 3 个）
    expect(bodyLines(`户名：${full(29)}`)).toBe(1);
    expect(bodyLines(`户名：${full(30)}`)).toBe(2);
  });

  it('空白单不带走任何填写内容，栏目名照旧（供手写）', () => {
    expect(BLANK_FORM.body).toBe('');
    expect(BLANK_FORM.name).toBe('');
    expect(BLANK_FORM.department).toBe('');
    expect(BLANK_FORM.date).toBe('');
  });
});
