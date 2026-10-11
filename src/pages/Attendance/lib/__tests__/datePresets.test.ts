/**
 * 日期快捷区间的回归。
 *
 * 这里最容易错的是**月份进位**：算"上上月"和"边界外扩一天"都要让月份越过 0
 * 或 12，而 JS 的 Date 会自动进位 —— 写对了是特性，写错了就是 2026-00-31。
 * 所以边界情况（1 月、12 月）必须钉死。
 */
import { describe, it, expect } from 'vitest';
import { presetRange, monthRange, matchPreset, describeRange, DATE_PRESETS } from '../datePresets';

// 用本地时间构造，避免 new Date('2026-10-11') 被当成 UTC 而在东八区偏一天
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('区间计算', () => {
  it('不加边界：上月 = 9-1 ~ 9-30', () => {
    expect(presetRange('last-month', day(2026, 10, 11), false)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('加边界：上月 → 上上月最后一天 ~ 本月第一天', () => {
    expect(presetRange('last-month', day(2026, 10, 11), true)).toEqual({ from: '2026-08-31', to: '2026-10-01' });
  });

  it('本月 / 上上月', () => {
    expect(presetRange('this-month', day(2026, 10, 11), false)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('two-months-ago', day(2026, 10, 11), false)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('two-months-ago', day(2026, 10, 11), true)).toEqual({ from: '2026-07-31', to: '2026-09-01' });
  });
});

describe('月份进位（最容易写错的地方）', () => {
  it('1 月的"上月"要退到 12 月', () => {
    expect(presetRange('last-month', day(2027, 1, 15), false)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(presetRange('last-month', day(2027, 1, 15), true)).toEqual({ from: '2026-11-30', to: '2027-01-01' });
  });

  it('1 月的"上上月"要退到 11 月', () => {
    expect(presetRange('two-months-ago', day(2027, 1, 15), false)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('12 月的"下月第一天"要进位到次年 1 月', () => {
    expect(presetRange('this-month', day(2026, 12, 5), true)).toEqual({ from: '2026-11-30', to: '2027-01-01' });
  });

  it('跨年：2027-01 的上月加边界，前端落在 2026-11-30', () => {
    expect(presetRange('last-month', day(2027, 1, 5), true)).toEqual({ from: '2026-11-30', to: '2027-01-01' });
  });

  it('闰年 2 月：2024 年 29 天，2026 年 28 天', () => {
    expect(monthRange(2024, 1, false)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange(2026, 1, false)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('不会产出 00 月或 13 月', () => {
    const all = ['last-month', 'this-month', 'two-months-ago'] as const;
    for (const id of all) {
      for (let m = 1; m <= 12; m++) {
        for (const pad of [false, true]) {
          const r = presetRange(id, day(2026, m, 15), pad);
          for (const v of [r.from, r.to]) {
            expect(v, `${id} @${m}月 pad=${pad}`).toMatch(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/);
          }
        }
      }
    }
  });
});

describe('预设高亮', () => {
  const today = day(2026, 10, 11);

  it('正好等于某个预设就认出来', () => {
    const r = presetRange('last-month', today, false);
    expect(matchPreset(r.from, r.to, today, false)).toBe('last-month');
  });

  it('手改过日期就不假装还挂着预设', () => {
    expect(matchPreset('2026-09-05', '2026-09-20', today, false)).toBeNull();
  });

  it('空区间不匹配任何预设', () => {
    expect(matchPreset('', '', today, false)).toBeNull();
  });

  it('边界开关会改变认定结果：加了边界的区间在不加边界的口径下不算预设', () => {
    const padded = presetRange('last-month', today, true);
    expect(matchPreset(padded.from, padded.to, today, false)).toBeNull();
    expect(matchPreset(padded.from, padded.to, today, true)).toBe('last-month');
  });
});

describe('区间文案', () => {
  it('三种形态', () => {
    expect(describeRange('', '')).toBe('全部时间');
    expect(describeRange('2026-09-01', '2026-09-30')).toBe('2026-09-01 ~ 2026-09-30');
    expect(describeRange('2026-09-01', '')).toBe('2026-09-01 起');
    expect(describeRange('', '2026-09-30')).toBe('截至 2026-09-30');
  });
});

describe('预设清单', () => {
  it('id 不重复，且每个都能算出区间', () => {
    const ids = DATE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const today = day(2026, 10, 11);
    for (const p of DATE_PRESETS) {
      const r = presetRange(p.id, today, false);
      expect(r.from < r.to, p.id).toBe(true);
    }
  });
});