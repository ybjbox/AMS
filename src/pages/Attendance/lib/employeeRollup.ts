/**
 * 打卡记录页的员工维度汇总（纯函数，可单测）。
 *
 * 为什么主表从"逐条打卡"改成"每人一行"：
 * 当前 1897 条分页是 89 页，翻到第三遍就没人愿意翻了；而这个页面真正要回答的
 * 是"这个人出勤怎么样、有没有问题"，不是"第 1024 条卡是谁的"。
 * 逐条打卡收进弹窗，主表只留能一眼扫完的 26 行。
 *
 * 口径全部吃**筛选后**的那一份 records，所以页面上的数字和筛选条件永远自洽：
 * 筛到 9 月，出勤天数就是 9 月的出勤天数，不会出现"列表 29 天、月报 31 天"。
 */
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';

export interface EmployeeRollupRow {
  employeeId: string;
  employeeName: string;
  /** 打卡条数 */
  records: number;
  /** 出勤天数（有打卡的天数） */
  days: number;
  firstDate: string;
  /** 最近打卡；用来一眼看出"这人是不是已经很久没来了" */
  lastDate: string;
  /** 其中来自企业微信的条数（其余为补卡/导入） */
  wecomRecords: number;
  anomalies: number;
  late: number;
  missing: number;
  early: number;
}

export type RollupSortKey = 'name' | 'records' | 'days' | 'anomalies' | 'lastDate';

/** 按工号分组：一律用工号，不用姓名——重名和改名都会让姓名不再唯一 */
export function rollupByEmployee(
  records: PunchRecord[],
  anomalies: Anomaly[] = []
): EmployeeRollupRow[] {
  const map = new Map<string, EmployeeRollupRow>();

  for (const r of records) {
    let row = map.get(r.employeeId);
    if (!row) {
      row = {
        employeeId: r.employeeId,
        // 姓名取库里最新的那条（records 已按 date,time 排序，遍历即按时间推进）
        employeeName: r.employeeName,
        records: 0,
        days: 0,
        firstDate: r.date,
        lastDate: r.date,
        wecomRecords: 0,
        anomalies: 0,
        late: 0,
        missing: 0,
        early: 0,
      };
      map.set(r.employeeId, row);
      // 新分组把首日定在这一行；后续 min/max 都在下面统一处理
      row.firstDate = r.date;
    }
    row.records += 1;
    if (r.source === 'wecom') row.wecomRecords += 1;
    if (r.date < row.firstDate) row.firstDate = r.date;
    if (r.date > row.lastDate) row.lastDate = r.date;
    row.employeeName = r.employeeName;
  }

  // 出勤天数要对日期去重，不能直接数条数（一天两班就有两条）
  const daysByEmp = new Map<string, Set<string>>();
  for (const r of records) {
    const s = daysByEmp.get(r.employeeId);
    if (s) s.add(r.date);
    else daysByEmp.set(r.employeeId, new Set([r.date]));
  }
  for (const [id, row] of map) row.days = daysByEmp.get(id)?.size ?? 0;

  for (const a of anomalies) {
    const row = map.get(a.employeeId);
    if (!row) continue;
    // 这个人当前筛选范围内根本没有打卡，却挂着异常 —— 不计入，
    // 否则"异常 3 条"和这个人名下的打卡条数对不上，看着像脏数据
    row.anomalies += 1;
    if (a.type === 'LATE_5' || a.type === 'LATE_15') row.late += 1;
    else if (a.type === 'MISSING_IN' || a.type === 'MISSING_OUT') row.missing += 1;
    else if (a.type === 'EARLY_LEAVE') row.early += 1;
  }

  return [...map.values()];
}

/**
 * 排序。默认按异常数倒序 —— 这个页面的主要用途是"谁有问题"，
 * 而不是"谁卡最多"。
 */
export function sortRollup(rows: EmployeeRollupRow[], key: RollupSortKey, dir: 'asc' | 'desc'): EmployeeRollupRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp: number;
    switch (key) {
      case 'name':
        // 中文按拼音排更符合"找人的直觉"；同名再按工号兜底，保证顺序稳定
        cmp = a.employeeName.localeCompare(b.employeeName, 'zh-Hans-CN') || a.employeeId.localeCompare(b.employeeId);
        break;
      case 'records':
        cmp = a.records - b.records;
        break;
      case 'days':
        cmp = a.days - b.days;
        break;
      case 'anomalies':
        cmp = a.anomalies - b.anomalies;
        break;
      case 'lastDate':
      default:
        cmp = a.lastDate < b.lastDate ? -1 : a.lastDate > b.lastDate ? 1 : 0;
        break;
    }
    // 数值列同值时退回姓名，保证翻页/重渲染顺序不跳
    return (cmp !== 0 ? cmp * sign : a.employeeName.localeCompare(b.employeeName, 'zh-Hans-CN')) || 0;
  });
}

/** 只看有异常的开关 */
export function filterByAnomaly(rows: EmployeeRollupRow[], onlyWithAnomaly: boolean): EmployeeRollupRow[] {
  return onlyWithAnomaly ? rows.filter((r) => r.anomalies > 0) : rows;
}

/** 整页合计，用来表头那一条汇总 */
export function rollupTotals(rows: EmployeeRollupRow[]): {
  employees: number;
  records: number;
  days: number;
  anomalies: number;
  wecomRecords: number;
} {
  return {
    employees: rows.length,
    records: rows.reduce((n, r) => n + r.records, 0),
    days: rows.reduce((n, r) => n + r.days, 0),
    anomalies: rows.reduce((n, r) => n + r.anomalies, 0),
    wecomRecords: rows.reduce((n, r) => n + r.wecomRecords, 0),
  };
}

/** 距今多少天没打卡（lastDate 为空时返回 null） */
export function daysSinceLast(lastDate: string, today: Date): number | null {
  if (!lastDate) return null;
  const last = new Date(`${lastDate}T00:00:00`);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (Number.isNaN(last.getTime())) return null;
  return Math.round((now.getTime() - last.getTime()) / 86400000);
}