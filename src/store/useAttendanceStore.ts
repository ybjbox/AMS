import { create } from 'zustand';
import { api } from '../services/mockApi';
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
        api.fetchShifts(),
        api.fetchSchedules(),
        api.fetchRecords(),
        api.fetchAnomalies(),
      ]);
      return { shifts, schedules, records, anomalies };
    });
  },

  addShift: async (shift) => {
    return createAsyncAction(set, async () => {
      const newShift = await api.createShift(shift);
      return { shifts: [...get().shifts, newShift] };
    });
  },

  updateShift: async (id, shift) => {
    return createAsyncAction(set, async () => {
      const updatedShift = await api.updateShift(id, shift);
      return {
        shifts: get().shifts.map((s) => (s.id === id ? updatedShift : s)),
      };
    });
  },

  deleteShift: async (id) => {
    return createAsyncAction(set, async () => {
      await api.deleteShift(id);
      return {
        shifts: get().shifts.filter((s) => s.id !== id),
      };
    });
  },

  setSchedules: async (schedules) => {
    return createAsyncAction(set, async () => {
      const updatedSchedules = await api.updateSchedules(schedules);
      return { schedules: updatedSchedules };
    });
  },

  setRecords: async (records) => {
    return createAsyncAction(set, async () => {
      const updatedRecords = await api.updateRecords(records);
      return { records: updatedRecords };
    });
  },

  analyzeAnomalies: async () => {
    return createAsyncAction(set, async () => {
      const anomalies = await api.analyzeAnomalies();
      return { anomalies };
    });
  },
}));
