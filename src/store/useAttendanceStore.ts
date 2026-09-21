import { create } from 'zustand';
import { attendanceApi } from '../services/attendanceApi';
import { createAsyncAction } from './utils';

export type Shift = {
  id: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

export type EmployeeSchedule = {
  employeeId: string;
  employeeName: string;
  shiftIds: string[];
};

export type PunchRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm:ss"
};

export type Anomaly = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: 'LATE_5' | 'LATE_15' | 'MISSING_IN' | 'MISSING_OUT' | 'EARLY_LEAVE';
  minutes?: number;
  description: string;
};

interface AttendanceState {
  shifts: Shift[];
  schedules: EmployeeSchedule[];
  records: PunchRecord[];
  anomalies: Anomaly[];
  isLoading: boolean;
  error: string | null;

  fetchData: () => Promise<void>;

  addShift: (shift: Shift) => Promise<void>;
  updateShift: (id: string, shift: Partial<Shift>) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;

  setSchedules: (schedules: EmployeeSchedule[]) => Promise<void>;
  setRecords: (records: PunchRecord[]) => Promise<void>;
  removeSchedule: (employeeId: string) => Promise<void>;
  clearSchedules: () => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
  clearRecords: () => Promise<void>;

  analyzeAnomalies: () => Promise<void>;
}

export const useAttendanceStore = create<AttendanceState>()((set, get) => ({
  shifts: [],
  schedules: [],
  records: [],
  anomalies: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    return createAsyncAction(set, async () => {
      const [shifts, schedules, records, anomalies] = await Promise.all([
        attendanceApi.fetchShifts(),
        attendanceApi.fetchSchedules(),
        attendanceApi.fetchRecords(),
        attendanceApi.fetchAnomalies(),
      ]);
      return { shifts, schedules, records, anomalies };
    });
  },

  addShift: async (shift) => {
    return createAsyncAction(set, async () => {
      const newShift = await attendanceApi.createShift(shift);
      return { shifts: [...get().shifts, newShift] };
    });
  },

  updateShift: async (id, shift) => {
    return createAsyncAction(set, async () => {
      const updatedShift = await attendanceApi.updateShift(id, shift);
      return {
        shifts: get().shifts.map((s) => (s.id === id ? updatedShift : s)),
      };
    });
  },

  deleteShift: async (id) => {
    return createAsyncAction(set, async () => {
      await attendanceApi.deleteShift(id);
      return {
        shifts: get().shifts.filter((s) => s.id !== id),
      };
    });
  },

  setSchedules: async (schedules) => {
    return createAsyncAction(set, async () => {
      const updatedSchedules = await attendanceApi.updateSchedules(schedules);
      return { schedules: updatedSchedules };
    });
  },

  setRecords: async (records) => {
    return createAsyncAction(set, async () => {
      const updatedRecords = await attendanceApi.updateRecords(records);
      return { records: updatedRecords };
    });
  },

  /** 删除单个员工排班：必须走 DELETE（PUT 批量是 upsert-only，删了会原地复活） */
  removeSchedule: async (employeeId) => {
    return createAsyncAction(set, async () => {
      await attendanceApi.deleteSchedule(employeeId);
      return { schedules: get().schedules.filter((s) => s.employeeId !== employeeId) };
    });
  },

  /** 清空全部排班（服务端仅 ADMIN） */
  clearSchedules: async () => {
    return createAsyncAction(set, async () => {
      const schedules = await attendanceApi.clearSchedules();
      return { schedules };
    });
  },

  /** 删除单条打卡记录 */
  removeRecord: async (id) => {
    return createAsyncAction(set, async () => {
      await attendanceApi.deleteRecord(id);
      return { records: get().records.filter((r) => r.id !== id) };
    });
  },

  /** 清空全部打卡记录（服务端仅 ADMIN；PUT /records 传空数组已被服务端拒） */
  clearRecords: async () => {
    return createAsyncAction(set, async () => {
      const records = await attendanceApi.clearRecords();
      return { records };
    });
  },

  analyzeAnomalies: async () => {
    return createAsyncAction(set, async () => {
      const anomalies = await attendanceApi.analyzeAnomalies();
      return { anomalies };
    });
  },
}));
