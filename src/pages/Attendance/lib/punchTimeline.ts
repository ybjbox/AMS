/**
 * 「点姓名 → 看这个人全部打卡记录」的时间轴口径（纯函数，可单测）。
 *
 * 为什么按天分组而不是拉一张平铺的长表：实测人均 57 条、最多 114 条（26 人），
 * 平铺 114 行几乎没法看出"他到底每天打了几次卡"。按天分组后，30 个日期头 +
 * N 条打卡，"今天打了 4 次"和"今天只打了 1 次"一眼可辨 —— 这才是看考勤的人
 * 真正要读的信息。
 */
import type { PunchRecord } from '@/store/useAttendanceStore';

export interface PunchDayGroup {
  date: string;
  punches: PunchRecord[];
}

/** 星期几：考勤场景里"周二"比"2026-09-15"更快读出是不是工作日 */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return WEEKDAYS[d.getDay()];
}

export function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getDay() === 0 || d.getDay() === 6;
}

/**
 * 按天分组。
 *
 * 日期倒序（最近的在上）—— 看考勤最常问的是"他最近怎么样"。
 * 同一天内的打卡按时间正序，因为一天的先后顺序本身就是信息。
 * 时间是定宽的 "HH:mm:ss"，字符串比较即时间比较。
 */
export function groupPunchesByDate(records: PunchRecord[]): PunchDayGroup[] {
  const byDate = new Map<string, PunchRecord[]>();
  for (const r of records) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, punches]) => ({
      date,
      punches: [...punches].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)),
    }));
}

export interface PunchSummary {
  total: number;
  /** 有打卡的天数 */
  days: number;
  firstDate: string;
  lastDate: string;
  /** 一天只打了 1 次的人日（可能是漏打卡，值得留意） */
  singlePunchDays: number;
  /** 一天打了 4 次及以上的人日（可能是多次进出，异常判定里常伴随缺卡） */
  busyDays: number;
}

export function summarizePunches(groups: PunchDayGroup[]): PunchSummary {
  const total = groups.reduce((n, g) => n + g.punches.length, 0);
  return {
    total,
    days: groups.length,
    firstDate: groups.length ? groups[groups.length - 1].date : '',
    lastDate: groups.length ? groups[0].date : '',
    singlePunchDays: groups.filter((g) => g.punches.length === 1).length,
    busyDays: groups.filter((g) => g.punches.length >= 4).length,
  };
}

/** 从全量打卡里挑出某个人的全部记录（表的列头即工号） */
export function recordsOfEmployee(records: PunchRecord[], employeeId: string): PunchRecord[] {
  return records.filter((r) => r.employeeId === employeeId);
}

/** 这个人被判定过异常的那些日期，用于在时间轴上点出来 */
export function anomalyDatesFor(
  anomalies: { employeeId: string; date: string }[],
  employeeId: string
): Set<string> {
  const out = new Set<string>();
  for (const a of anomalies) if (a.employeeId === employeeId) out.add(a.date);
  return out;
}