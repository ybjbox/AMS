/**
 * 导入预览逐行勾选的回归。
 *
 * 这些规则最怕"数字对不上"：勾选框、批量按钮、底部汇总、提交按钮上的数字
 * 必须讲同一个故事，所以逐条钉死。
 *
 * 最重要的一条前提（有过一次踩坑）：**重复行不可勾**。判重键是
 * (工号,日期,时间)，姓名又由工号从员工档案唯一决定，于是重复行携带的信息
 * 与库里那一行逐字段相同 —— 勾它与不勾它，结果完全一致。早期版本把重复行
 * 当成可勾的行，于是"可导入 5 行"实际送出 3 行，数字当场对不上。
 */
import { describe, it, expect } from 'vitest';
import { isRowSelectable, matchesFilter, applyBulk, rowsToImport, computeCounts } from '../importSelection';
import type { RowLike } from '../importSelection';

const ok = (n: number): RowLike => ({ rowNumber: n, errors: [], duplicate: false });
const dup = (n: number): RowLike => ({ rowNumber: n, errors: ['库中已存在该分钟打卡，导入时将跳过'], duplicate: true });
const bad = (n: number): RowLike => ({ rowNumber: n, errors: ['工号 X 与姓名「Y」都找不到对应员工'], duplicate: false });

// 3 条有效 / 2 条重复 / 1 条错误
const rows: RowLike[] = [ok(1), dup(2), ok(3), bad(4), dup(5), ok(6)];
const defaultSelected = () => new Set([1, 3, 6]); // 默认只勾可导入的

describe('行可勾性', () => {
  it('有效行可勾，重复行与错误行都不可勾', () => {
    expect(isRowSelectable(ok(1))).toBe(true);
    expect(isRowSelectable(dup(2))).toBe(false);
    expect(isRowSelectable(bad(4))).toBe(false);
  });
});

describe('筛选', () => {
  it('四种筛选各自命中正确的行', () => {
    expect(rows.filter((r) => matchesFilter(r, 'all')).map((r) => r.rowNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.filter((r) => matchesFilter(r, 'problem')).map((r) => r.rowNumber)).toEqual([2, 4, 5]);
    expect(rows.filter((r) => matchesFilter(r, 'duplicate')).map((r) => r.rowNumber)).toEqual([2, 5]);
    expect(rows.filter((r) => matchesFilter(r, 'importable')).map((r) => r.rowNumber)).toEqual([1, 3, 6]);
  });
});

describe('批量动作只作用于当前筛选下可见的行', () => {
  it('「只看重复 → 全不选」不会动到另外三行', () => {
    // 重复行本来就没被勾，所以这一下应该什么也不变
    const next = applyBulk(rows, 'duplicate', 'none', defaultSelected());
    expect([...next].sort((a, b) => a - b)).toEqual([1, 3, 6]);
  });

  it('「只看可导入 → 全不选」清空三个有效行', () => {
    const next = applyBulk(rows, 'importable', 'none', defaultSelected());
    expect(next.size).toBe(0);
  });

  it('「全部 → 全选」只把可导入的勾上，重复与错误行进不来', () => {
    const next = applyBulk(rows, 'all', 'all', new Set());
    expect([...next].sort((a, b) => a - b)).toEqual([1, 3, 6]);
  });

  it('反选只翻当前可见的行', () => {
    const next = applyBulk(rows, 'importable', 'invert', defaultSelected());
    expect(next.size).toBe(0);
    const half = applyBulk(rows, 'importable', 'invert', new Set([1]));
    expect([...half].sort((a, b) => a - b)).toEqual([3, 6]);
  });

  it('批量动作不会把重复行或错误行塞进选中集合', () => {
    const next = applyBulk(rows, 'all', 'invert', new Set());
    expect(next.has(2)).toBe(false);
    expect(next.has(4)).toBe(false);
    expect([...next].sort((a, b) => a - b)).toEqual([1, 3, 6]);
  });
});

describe('实际送去导入的行', () => {
  it('重复行不会被送出（与改动前的 filter(errors.length===0) 行为一致）', () => {
    expect(rowsToImport(rows, defaultSelected()).map((r) => r.rowNumber)).toEqual([1, 3, 6]);
  });

  it('即使被塞进选中集合，重复/错误行仍送不出去', () => {
    const sel = new Set([...defaultSelected(), 2, 4, 5]);
    expect(rowsToImport(rows, sel).map((r) => r.rowNumber)).toEqual([1, 3, 6]);
  });

  it('用户取消某一行后它就不送了', () => {
    const sel = new Set([1, 6]);
    expect(rowsToImport(rows, sel).map((r) => r.rowNumber)).toEqual([1, 6]);
  });
});

describe('底部汇总数字', () => {
  it('默认：导入 3，重复 2，错误 1，取消 0', () => {
    const c = computeCounts(rows, 'all', defaultSelected());
    expect(c.willImport).toBe(3);
    expect(c.duplicates).toBe(2);
    expect(c.invalid).toBe(1);
    expect(c.deselected).toBe(0);
    expect(c.allVisibleSelected).toBe(true);
  });

  it('取消一行后：导入 2，取消 1，账要能对上', () => {
    const c = computeCounts(rows, 'all', new Set([1, 3]));
    expect(c.willImport).toBe(2);
    expect(c.deselected).toBe(1);
  });

  it('全不选时提交按钮应禁用', () => {
    const c = computeCounts(rows, 'all', new Set());
    expect(c.willImport).toBe(0);
    expect(c.deselected).toBe(3);
    expect(c.allVisibleSelected).toBe(false);
    expect(c.someVisibleSelected).toBe(false);
  });

  it('全表恒等式：导入 + 重复 + 错误 + 取消 === 总行数', () => {
    for (const sel of [defaultSelected(), new Set([1, 3]), new Set<number>([6]), new Set<number>()]) {
      const c = computeCounts(rows, 'all', sel);
      expect(c.willImport + c.duplicates + c.invalid + c.deselected).toBe(rows.length);
    }
  });

  it('表头三态只反映当前筛选下可见的行', () => {
    // 切到「重复」：一个可勾选的都没有 → 既不是全选也不是部分
    const c = computeCounts(rows, 'duplicate', defaultSelected());
    expect(c.visibleSelectable).toBe(0);
    expect(c.allVisibleSelected).toBe(false);
    expect(c.someVisibleSelected).toBe(false);
    // 但全表口径的 willImport 不受筛选影响
    expect(c.willImport).toBe(3);
  });

  it('切到「可导入」取消一行 → 部分选中', () => {
    const c = computeCounts(rows, 'importable', new Set([1, 3]));
    expect(c.visibleSelectable).toBe(3);
    expect(c.visibleSelected).toBe(2);
    expect(c.allVisibleSelected).toBe(false);
    expect(c.someVisibleSelected).toBe(true);
  });

  it('被筛选隐藏的已勾行仍计入 willImport，但不计入 visibleSelected', () => {
    const c = computeCounts(rows, 'problem', defaultSelected());
    expect(c.willImport).toBe(3); // 三行都还在，只是当前看不见
    expect(c.visibleSelected).toBe(0);
  });
});