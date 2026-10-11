/**
 * 打卡记录筛选的日期快捷区间。
 *
 * 做成配置而不是写死在组件里，是因为它有两处会随业务变：
 *  1. 需要哪几个区间（对账看上月、退上上月、看当月）；
 *  2. 要不要在区间前后各多留一天 —— 见下面 padDays 的理由。
 *
 * padDays 为什么默认开：夜班组是 17:30-01:00 跨零点交接，10-01 凌晨 00:3x 的
 * 打卡实际属于 09-30 那一班。严格按自然月取 09-01~09-30，跨零点那班会漏掉半个。
 * 所以默认把区间放到「上上月最后一天 ~ 本月第一天」。
 * 但这会让"9 月"这个说法变得不精确，所以留成可关的开关。
 */

export type DatePresetId = 'last-month' | 'this-month' | 'two-months-ago';

export interface PresetRange {
  from: string;
  to: string;
}

/**
 * 预设清单。增删区间只改这里 —— 组件按这个数组渲染按钮，不硬编码 id。
 */
export const DATE_PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'last-month', label: '上月' },
  { id: 'this-month', label: '本月' },
  { id: 'two-months-ago', label: '上上月' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * m 是 0-based 的月份，与 Date 一致；**允许越界**（-1 表示上年 12 月，12 表示次年 1 月）。
 *
 * 越界必须交给 Date 去归一，不能自己 `pad2(m + 1)` —— 那样 m=-1 会拼出
 * "2026-00-01" 这种不存在的日期。取 12 点而不是 0 点，是为了躲开个别时区在
 * 午夜跳变导致的日期回退。
 */
function ymd(y: number, m: number, d: number): string {
  const dt = new Date(y, m, d, 12, 0, 0);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** 越界的 m 同样交给 Date：new Date(y, m + 1, 0) 即 m 的最后一天 */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0, 12, 0, 0).getDate();
}

/** 某月的核心区间，或按 padDays 外扩一天 */
export function monthRange(y: number, m: number, padDays: boolean): PresetRange {
  if (!padDays) {
    return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) };
  }
  return {
    from: ymd(y, m - 1, daysInMonth(y, m - 1)),
    to: ymd(y, m + 1, 1),
  };
}

export function presetRange(id: DatePresetId, today: Date, padDays: boolean): PresetRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (id) {
    case 'this-month':
      return monthRange(y, m, padDays);
    case 'two-months-ago':
      return monthRange(y, m - 2, padDays);
    case 'last-month':
    default:
      return monthRange(y, m - 1, padDays);
  }
}

/**
 * 当前 from/to 正好等于某个预设（含/不含边界），就返回那个 id —— 用来高亮按钮。
 * 用户手改过日期就返回 null，此时不该假装还挂着某个预设。
 */
export function matchPreset(from: string, to: string, today: Date, padDays: boolean): DatePresetId | null {
  for (const p of DATE_PRESETS) {
    const r = presetRange(p.id, today, padDays);
    if (r.from === from && r.to === to) return p.id;
  }
  return null;
}

/** 把区间文字拼成一行说明，给弹窗顶部用 */
export function describeRange(from: string, to: string): string {
  if (!from && !to) return '全部时间';
  if (from && to) return `${from} ~ ${to}`;
  return from ? `${from} 起` : `截至 ${to}`;
}