/**
 * 本地日历日 —— 全站"今天"的唯一算法。
 *
 * 系统里的日期字符串（打卡日期、合同到期日、公告生效日、请假起止）都是**本地日历日**：
 * 由日期选择器写入、按 YYYY-MM-DD 文本比较。而 `new Date().toISOString().slice(0, 10)`
 * 取的是 **UTC 日**，在 UTC+8 下每天 00:00–07:59 会少一天，于是出现：
 *  - 半夜提交的转正申请， startDate 写成"昨天"；
 *  - 00:30 点「一键分析异常」，当日异常一条都不通知（`a.date !== today` 全部落空）；
 *  - 跨零点前后公告的"生效中"判定翻转。
 * 所以这些位置一律走这里的本地口径，不要再手写 toISOString。
 */

/** Date → 本地 YYYY-MM-DD */
export function formatLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Date → 本地 `YYYY-MM-DD HH:MM:SS`，与 SQLite `datetime('now','localtime')` **逐字符同形**。
 *
 * 必须由 JS 生成时间戳的场合（同一事务里多个写入要共享同一个"现在"）只能走这里：
 * 之前 approvals/续签用 `new Date().toISOString()` 往同一列里写 `...T...Z`，
 * 而列默认值是 `datetime('now','localtime')`（空格分隔、无 Z），一列两种格式 ——
 * `ORDER BY createdAt` 是**文本序**，'T'(0x54) > ' '(0x20)，同一天内两种来源的行会串位。
 */
export function formatLocalDateTime(d: Date = new Date()): string {
  const time = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return `${formatLocalDate(d)} ${time}`;
}

/** 本地今天（YYYY-MM-DD） */
export function localToday(): string {
  return formatLocalDate(new Date());
}

/** 本地 N 天前（负数表示之后），用于趋势图的日期轴 */
export function localDateOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return formatLocalDate(d);
}

/**
 * 距今多少天（按**本地日历日**相减，可为负）。
 *
 * 不要用 `new Date('YYYY-MM-DD') - Date.now()`：前者是 UTC 零点、后者是本地时刻，
 * 在 UTC+8 下每天 00:00–07:59 会多算一天，"合同到期剩 N 天"就跟着差一格。
 * 两端都归到本地日历日之后再除以 86400000，结果与"看日历数天数"一致。
 */
export function daysUntilLocal(dateStr: string | null | undefined, from: Date = new Date()): number {
  return daysUntilLocalOrNull(dateStr, from) ?? 0;
}

/**
 * 同 `daysUntilLocal`，但**日期缺失/格式不对时返回 null** 而不是 0。
 *
 * 「还剩 0 天 = 今天到期」和「没有日期」是两回事：提醒扫描必须能区分二者，
 * 否则一条空 contractExpiry 就会给所有人发出「今天到期」。
 */
export function daysUntilLocalOrNull(
  dateStr: string | null | undefined,
  from: Date = new Date()
): number | null {
  const raw = String(dateStr ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target - today) / 86_400_000);
}
