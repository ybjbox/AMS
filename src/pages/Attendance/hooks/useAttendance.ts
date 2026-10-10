import { useState, useEffect, useMemo } from 'react';
import { useAttendanceStore, PunchRecord, Anomaly } from '@/store/useAttendanceStore';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { User } from '@/types';
import { useUserStore as useAuthStore } from '@/store/useUserStore';

/**
 * 考勤页的四个标签。
 *
 * 原先有六个 ——「逐日排班」与「班次管理」已撤掉（2026-10-10）：
 * 判定链路 `buildShiftPlanner` 是**部门时段优先、排班兜底**，而 5 个部门都配了
 * 部门时段（共 11 条），所以这两页配的东西永远读不到；界面留着只会让人以为
 * 「改了班次却没生效」。排班兜底本身保留在服务端（`attendanceDb.ts`），将来
 * 有部门不配时段时仍能走通，只是不再暴露入口。
 */
export type TabType = 'records' | 'anomalies' | 'shift-rules' | 'monthly';

export interface UseAttendanceReturn {
  // State
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Store Data
  records: PunchRecord[];
  anomalies: Anomaly[];
  isLoading: boolean;
  users: User[];

  // Computed Data
  filteredAnomalies: Anomaly[];

  // Store Actions（写动作把失败原因作为返回值：null=成功，见 src/store/utils.ts）
  fetchData: () => Promise<string | null>;
  // 这个此前被写成 `=> void`：接口把 store 真实的 Promise<string|null> 抹掉了，
  // 于是调用点连"忘了看返回值"都不会被类型系统提示（2026-09-26 审查 B3）
  setRecords: (records: PunchRecord[]) => Promise<string | null>;
  removeRecord: (id: string) => Promise<string | null>;
  clearRecords: () => Promise<string | null>;
  analyzeAnomalies: () => Promise<string | null>;

  // Auth
  hasPermission: (permission: string) => boolean;

  // Pagination
  recordsPage: number;
  setRecordsPage: (page: number) => void;
  ITEMS_PER_PAGE: number;
}

export function useAttendance(): UseAttendanceReturn {
  const [activeTab, setActiveTab] = useState<TabType>('records');
  const [searchQuery, setSearchQuery] = useState('');

  const ITEMS_PER_PAGE = 20;
  const [recordsPage, setRecordsPage] = useState(1);

  const fetchData = useAttendanceStore((state) => state.fetchData);

  const records = useAttendanceStore((state) => state.records);
  const anomalies = useAttendanceStore((state) => state.anomalies);
  const isLoading = useAttendanceStore((state) => state.isLoading);

  const setRecords = useAttendanceStore((state) => state.setRecords);
  const removeRecord = useAttendanceStore((state) => state.removeRecord);
  const clearRecords = useAttendanceStore((state) => state.clearRecords);
  const analyzeAnomalies = useAttendanceStore((state) => state.analyzeAnomalies);

  const users = useEmployeeStore((state) => state.users);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const filteredAnomalies = useMemo(
    () =>
      anomalies.filter((a) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          (a.employeeName || '').toLowerCase().includes(query) || (a.employeeId || '').toLowerCase().includes(query)
        );
      }),
    [anomalies, searchQuery]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,

    records,
    anomalies,
    isLoading,
    users,

    filteredAnomalies,

    setRecords,
    fetchData,
    removeRecord,
    clearRecords,
    analyzeAnomalies,

    hasPermission,

    recordsPage,
    setRecordsPage,
    ITEMS_PER_PAGE,
  };
}
