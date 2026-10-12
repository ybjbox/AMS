/**
 * 考勤页的筛选口径（纯函数，可单测）。
 *
 * 为什么放在 lib 而不是组件里：
 * 「打卡记录筛完剩多少条」「异常按类型分组后各多少」这两个数字要同时喂给
 * 筛选栏的计数、表格的分页总数和空状态提示。三处各写一遍筛选迟早会漂，
 * 所以筛选本身必须是**一个**函数，组件只负责收集条件。
 *
 * 为什么是前端筛选而不是走服务端 dateFrom/dateTo/分页：
 * `fetchData` 已经把全量记录拉进 store（`records.length` 就是「库里一共导了多少条」，
 * 清空确认框与筛选栏的「命中 X / Y」都读它），再分页会出现两份真相 —— 表格翻页翻的是
 * 服务端切片，表头合计数的是内存全量，两边对不上。数据量按当前口径（32 天 1897 条、
 * 约 60 条/天）完全撑得住内存筛选；真到需要分页时，把这三个函数换成请求即可，
 * 组件签名不变。
 */
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';

export type RecordSourceFilter = 'all' | 'wecom' | 'manual';

export interface RecordFilter {
  /** 姓名或工号，大小写不敏感 */
  query: string;
  /** YYYY-MM-DD，空串 = 不限。date 是零填充定宽的，字符串比较即日期比较。 */
  dateFrom: string;
  dateTo: string;
  source: RecordSourceFilter;
}

export const EMPTY_RECORD_FILTER: RecordFilter = {
  query: '',
  dateFrom: '',
  dateTo: '',
  source: 'all',
};

export function isRecordFilterActive(f: RecordFilter): boolean {
  return f.query.trim() !== '' || f.dateFrom !== '' || f.dateTo !== '' || f.source !== 'all';
}

/** 打卡记录的来源只有两种取值：'wecom' 与 ''（补卡/导入/手工，历史行也是空串）。 */
function matchesSource(record: PunchRecord, source: RecordSourceFilter): boolean {
  if (source === 'all') return true;
  return source === 'wecom' ? record.source === 'wecom' : record.source !== 'wecom';
}

export function filterRecords(records: PunchRecord[], filter: RecordFilter): PunchRecord[] {
  const query = filter.query.trim().toLowerCase();
  const { dateFrom, dateTo, source } = filter;

  // 起止写反了（用户先填了 dateTo）不该静默返回空表，按交换处理
  const lo = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
  const hi = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;

  if (!query && !lo && !hi && source === 'all') return records;

  return records.filter((r) => {
    if (lo && r.date < lo) return false;
    if (hi && r.date > hi) return false;
    if (!matchesSource(r, source)) return false;
    if (!query) return true;
    return r.employeeName.toLowerCase().includes(query) || r.employeeId.toLowerCase().includes(query);
  });
}

/**
 * 异常类型按「要采取什么动作」归组，而不是按枚举值罗列：
 * 迟到是扣钱、缺卡是要补证明、早退是另一回事。三档够用，且每档都有独立处置。
 */
export type AnomalyGroup = 'all' | 'late' | 'missing' | 'early';

export const ANOMALY_GROUPS: { id: AnomalyGroup; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'late', label: '迟到' },
  { id: 'missing', label: '缺卡' },
  { id: 'early', label: '早退' },
];

export function anomalyGroupOf(type: Anomaly['type']): Exclude<AnomalyGroup, 'all'> {
  if (type === 'LATE_5' || type === 'LATE_15') return 'late';
  if (type === 'MISSING_IN' || type === 'MISSING_OUT') return 'missing';
  return 'early';
}

export function filterAnomalies(anomalies: Anomaly[], query: string, group: AnomalyGroup): Anomaly[] {
  const q = query.trim().toLowerCase();
  if (!q && group === 'all') return anomalies;
  return anomalies.filter((a) => {
    if (group !== 'all' && anomalyGroupOf(a.type) !== group) return false;
    if (!q) return true;
    return a.employeeName.toLowerCase().includes(q) || a.employeeId.toLowerCase().includes(q);
  });
}

/** 每个分组各多少条（驱动筛选栏上的计数徽章）。 */
export function anomalyGroupCounts(anomalies: Anomaly[]): Record<AnomalyGroup, number> {
  const counts: Record<AnomalyGroup, number> = { all: anomalies.length, late: 0, missing: 0, early: 0 };
  for (const a of anomalies) counts[anomalyGroupOf(a.type)] += 1;
  return counts;
}

/** 异常类型 → 界面文案。枚举值不许直接露给员工看（MASTER.md Components · Select）。 */
export const ANOMALY_TYPE_LABEL: Record<Anomaly['type'], string> = {
  LATE_5: '迟到超过 5 分钟',
  LATE_15: '迟到超过 15 分钟',
  MISSING_IN: '缺上班卡',
  MISSING_OUT: '缺下班卡',
  EARLY_LEAVE: '早退',
};

export type AnomalyTone = 'warning' | 'destructive' | 'neutral';

export function anomalyTone(type: Anomaly['type']): AnomalyTone {
  if (type === 'MISSING_IN' || type === 'MISSING_OUT') return 'destructive';
  if (type === 'EARLY_LEAVE') return 'neutral';
  return 'warning';
}