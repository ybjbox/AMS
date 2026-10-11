import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAttendanceStore } from '@/store/useAttendanceStore';
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';
import { useUserStore as useAuthStore } from '@/store/useUserStore';
import {
  EMPTY_RECORD_FILTER,
  countPunchDays,
  filterAnomalies,
  filterRecords,
  anomalyGroupCounts,
  isRecordFilterActive,
} from '../lib/filters';
import type { AnomalyGroup, RecordFilter } from '../lib/filters';

/**
 * 考勤页的四个标签，**按实际作业顺序排**（这是本次重排的核心）。
 *
 * 依赖关系是单向的：部门时段是异常分析的前置（不配就整批「未判定」），
 * 打卡记录是分析的输入，月报是分析的产出。所以标签顺序从「打卡记录打头」
 * 改成「部门时段打头」—— 让最容易被忽略的前置条件排在最前面。
 *
 * 2026-10-10 撤掉的「逐日排班」与「班次管理」不在这里：判定链路是
 * 「部门时段优先、排班兜底」，而 5 个部门都配了时段（共 11 条），这两页配的
 * 东西永远读不到；界面留着只会让人以为"改了班次却没生效"。排班兜底本身仍在
 * 服务端，将来有部门不配时段时仍能走通，只是不再暴露入口。
 */
export type TabType = 'shift-rules' | 'records' | 'anomalies' | 'monthly';

export const ATTENDANCE_TABS: { tab: TabType; label: string }[] = [
  { tab: 'shift-rules', label: '部门时段' },
  { tab: 'records', label: '打卡记录' },
  { tab: 'anomalies', label: '异常分析' },
  { tab: 'monthly', label: '月度报表' },
];

const VALID_TABS = new Set<string>(ATTENDANCE_TABS.map((t) => t.tab));

export interface UseAttendanceReturn {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  // Store Data
  records: PunchRecord[];
  anomalies: Anomaly[];
  shiftRuleCount: number;
  isLoading: boolean;

  // 打卡记录筛选
  recordFilter: RecordFilter;
  setRecordFilter: (patch: Partial<RecordFilter>) => void;
  resetRecordFilter: () => void;
  recordFilterActive: boolean;
  filteredRecords: PunchRecord[];
  /** 筛选后的出勤人次：与统计卡同源，只是把范围收窄到当前筛选条件 */
  punchDays: number;
  totalPunchDays: number;

  // 异常筛选
  anomalyQuery: string;
  setAnomalyQuery: (q: string) => void;
  anomalyGroup: AnomalyGroup;
  setAnomalyGroup: (g: AnomalyGroup) => void;
  filteredAnomalies: Anomaly[];
  anomalyCounts: Record<AnomalyGroup, number>;

  // 写动作（失败原因作为返回值：null = 成功，见 src/store/utils.ts）
  fetchData: () => Promise<string | null>;
  fetchShiftRules: () => Promise<string | null>;
  setRecords: (records: PunchRecord[]) => Promise<string | null>;
  removeRecord: (id: string) => Promise<string | null>;
  clearRecords: () => Promise<string | null>;
  analyzeAnomalies: () => Promise<string | null>;

  hasPermission: (permission: string) => boolean;

  recordsPage: number;
  setRecordsPage: (page: number) => void;
  ITEMS_PER_PAGE: number;
}

export const ITEMS_PER_PAGE = 20;

export function useAttendance(): UseAttendanceReturn {
  // 标签走 ?tab=，与打印工具、设置页同一套做法（PrintTools/index.tsx）。
  // 这解决了三件事：刷新不丢位置、异常分析可以直接发链接给别人、浏览器前进/后退可用。
  // 非法值（含旧书签里的 ?tab=schedules）回落到第一个标签，不报错也不白屏。
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabType = VALID_TABS.has(tabParam ?? '') ? (tabParam as TabType) : 'shift-rules';

  const setActiveTab = useCallback(
    (tab: TabType) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [searchQuery, setAnomalyQuery] = useState('');
  const [anomalyGroup, setAnomalyGroup] = useState<AnomalyGroup>('all');
  const [recordFilter, setRecordFilterState] = useState<RecordFilter>(EMPTY_RECORD_FILTER);

  const fetchData = useAttendanceStore((state) => state.fetchData);
  const fetchShiftRules = useAttendanceStore((state) => state.fetchShiftRules);

  const records = useAttendanceStore((state) => state.records);
  const anomalies = useAttendanceStore((state) => state.anomalies);
  const shiftRuleCount = useAttendanceStore((state) => state.shiftRules.length);
  const isLoading = useAttendanceStore((state) => state.isLoading);

  const setRecords = useAttendanceStore((state) => state.setRecords);
  const removeRecord = useAttendanceStore((state) => state.removeRecord);
  const clearRecords = useAttendanceStore((state) => state.clearRecords);
  const analyzeAnomalies = useAttendanceStore((state) => state.analyzeAnomalies);

  const hasPermission = useAuthStore((state) => state.hasPermission);

  const setRecordFilter = useCallback((patch: Partial<RecordFilter>) => {
    setRecordFilterState((prev) => ({ ...prev, ...patch }));
  }, []);
  const resetRecordFilter = useCallback(() => setRecordFilterState(EMPTY_RECORD_FILTER), []);

  // 依赖逐字段拆开而不是整个对象，是为了让"改了筛选但命中数没变"时不重算。
  const { query, dateFrom, dateTo, source } = recordFilter;
  const filteredRecords = useMemo(
    () => filterRecords(records, { query, dateFrom, dateTo, source }),
    [records, query, dateFrom, dateTo, source]
  );

  // 筛选结果一变就回到第 1 页：停在第 7 页却只剩 2 条结果是典型的死胡同。
  // 在渲染期比较并就地修正（React 官方 "adjusting state when a prop changes"），
  // 而不是塞进 useEffect —— effect 里 setState 会多跑一轮渲染，
  // 也会被 react-hooks/set-state-in-effect 拦下。
  const [recordsPage, setRecordsPage] = useState(1);
  const [lastMatchCount, setLastMatchCount] = useState(filteredRecords.length);
  if (filteredRecords.length !== lastMatchCount) {
    setLastMatchCount(filteredRecords.length);
    setRecordsPage(1);
  }

  const filteredAnomalies = useMemo(
    () => filterAnomalies(anomalies, searchQuery, anomalyGroup),
    [anomalies, searchQuery, anomalyGroup]
  );
  const anomalyCounts = useMemo(() => anomalyGroupCounts(anomalies), [anomalies]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    activeTab,
    setActiveTab,

    records,
    anomalies,
    shiftRuleCount,
    isLoading,

    recordFilter,
    setRecordFilter,
    resetRecordFilter,
    recordFilterActive: isRecordFilterActive(recordFilter),
    filteredRecords,
    punchDays: countPunchDays(filteredRecords),
    totalPunchDays: countPunchDays(records),

    anomalyQuery: searchQuery,
    setAnomalyQuery,
    anomalyGroup,
    setAnomalyGroup,
    filteredAnomalies,
    anomalyCounts,

    setRecords,
    fetchData,
    fetchShiftRules,
    removeRecord,
    clearRecords,
    analyzeAnomalies,

    hasPermission,

    recordsPage,
    setRecordsPage,
    ITEMS_PER_PAGE,
  };
}