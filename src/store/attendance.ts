import { create } from 'zustand';
import { api } from '../services/mockApi';

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

export const useAttendanceStore = create<AttendanceState>()((set) => ({
  shifts: [],
  schedules: [],
  records: [],
  anomalies: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [shifts, schedules, records, anomalies] = await Promise.all([
        api.fetchShifts(),
        api.fetchSchedules(),
        api.fetchRecords(),
        api.fetchAnomalies(),
      ]);
      set({ shifts, schedules, records, anomalies, isLoading: false });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  addShift: async (shift) => {
    set({ isLoading: true, error: null });
    try {
      const newShift = await api.createShift(shift);
      set((state) => ({ shifts: [...state.shifts, newShift], isLoading: false }));
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  updateShift: async (id, shift) => {
    set({ isLoading: true, error: null });
    try {
      const updatedShift = await api.updateShift(id, shift);
      set((state) => ({
        shifts: state.shifts.map((s) => (s.id === id ? updatedShift : s)),
        isLoading: false,
      }));
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  deleteShift: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteShift(id);
      set((state) => ({
        shifts: state.shifts.filter((s) => s.id !== id),
        isLoading: false,
      }));
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  setSchedules: async (schedules) => {
    set({ isLoading: true, error: null });
    try {
      const updatedSchedules = await api.updateSchedules(schedules);
      set({ schedules: updatedSchedules, isLoading: false });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  setRecords: async (records) => {
    set({ isLoading: true, error: null });
    try {
      const updatedRecords = await api.updateRecords(records);
      set({ records: updatedRecords, isLoading: false });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },

  analyzeAnomalies: async () => {
    set({ isLoading: true, error: null });
    try {
      const anomalies = await api.analyzeAnomalies();
      set({ anomalies, isLoading: false });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  },
}));
