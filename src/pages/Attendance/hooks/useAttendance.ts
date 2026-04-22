import { useState, useEffect, useMemo } from 'react';
import { useAttendanceStore, PunchRecord, EmployeeSchedule, Anomaly, Shift } from '../../../store/useAttendanceStore';
import { useEmployeeStore } from '../../../store/useEmployeeStore';
import { User } from '../../../types';
import { useUserStore as useAuthStore } from '../../../store/useUserStore';

export type TabType = 'records' | 'schedules' | 'anomalies' | 'shifts';

export interface UseAttendanceReturn {
  // State
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  scheduleSearchQuery: string;
  setScheduleSearchQuery: (q: string) => void;
  editingShift: Partial<Shift> | null;
  setEditingShift: React.Dispatch<React.SetStateAction<Partial<Shift> | null>>;

  // Store Data
  records: PunchRecord[];
  schedules: EmployeeSchedule[];
  anomalies: Anomaly[];
  shifts: Shift[];
  isLoading: boolean;
  users: User[];

  // Computed Data
  filteredAnomalies: Anomaly[];
  filteredSchedules: EmployeeSchedule[];

  // Store Actions
  setRecords: (records: PunchRecord[]) => void;
  setSchedules: (schedules: EmployeeSchedule[]) => void;
  analyzeAnomalies: () => void;
  addShift: (shift: Shift) => void;
  updateShift: (id: string, shift: Partial<Shift>) => void;
  deleteShift: (id: string) => void;

  // Auth
  hasPermission: (permission: string) => boolean;
}

export function useAttendance(): UseAttendanceReturn {
  const [activeTab, setActiveTab] = useState<TabType>('records');
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
  const [editingShift, setEditingShift] = useState<Partial<Shift> | null>(null);

  const fetchData = useAttendanceStore((state) => state.fetchData);

  const records = useAttendanceStore((state) => state.records);
  const schedules = useAttendanceStore((state) => state.schedules);
  const anomalies = useAttendanceStore((state) => state.anomalies);
  const shifts = useAttendanceStore((state) => state.shifts);
  const isLoading = useAttendanceStore((state) => state.isLoading);

  const setRecords = useAttendanceStore((state) => state.setRecords);
  const setSchedules = useAttendanceStore((state) => state.setSchedules);
  const analyzeAnomalies = useAttendanceStore((state) => state.analyzeAnomalies);
  const addShift = useAttendanceStore((state) => state.addShift);
  const updateShift = useAttendanceStore((state) => state.updateShift);
  const deleteShift = useAttendanceStore((state) => state.deleteShift);

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

  const filteredSchedules = useMemo(
    () =>
      schedules.filter((s) => {
        if (!scheduleSearchQuery.trim()) return true;
        const query = scheduleSearchQuery.toLowerCase();
        return (
          (s.employeeName || '').toLowerCase().includes(query) || (s.employeeId || '').toLowerCase().includes(query)
        );
      }),
    [schedules, scheduleSearchQuery]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    scheduleSearchQuery,
    setScheduleSearchQuery,
    editingShift,
    setEditingShift,

    records,
    schedules,
    anomalies,
    shifts,
    isLoading,
    users,

    filteredAnomalies,
    filteredSchedules,

    setRecords,
    setSchedules,
    analyzeAnomalies,
    addShift,
    updateShift,
    deleteShift,

    hasPermission,
  };
}
