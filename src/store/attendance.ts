import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  
  addShift: (shift: Shift) => void;
  updateShift: (id: string, shift: Partial<Shift>) => void;
  deleteShift: (id: string) => void;
  
  setSchedules: (schedules: EmployeeSchedule[]) => void;
  setRecords: (records: PunchRecord[]) => void;
  
  analyzeAnomalies: () => void;
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      shifts: [
        { id: '1', name: '正常班', startTime: '09:00', endTime: '18:00' }
      ],
      schedules: [],
      records: [],
      anomalies: [],
      
      addShift: (shift) => set((state) => ({ shifts: [...state.shifts, shift] })),
      updateShift: (id, shift) => set((state) => ({
        shifts: state.shifts.map(s => s.id === id ? { ...s, ...shift } : s)
      })),
      deleteShift: (id) => set((state) => ({
        shifts: state.shifts.filter(s => s.id !== id)
      })),
      
      setSchedules: (schedules) => set({ schedules }),
      setRecords: (records) => set({ records }),
      
      analyzeAnomalies: () => {
        // Mock backend processing
        const mockAnomalies: Anomaly[] = [
          {
            id: '1',
            employeeId: 'EMP001',
            employeeName: '张三',
            date: '2026-03-16',
            type: 'LATE_5',
            minutes: 10,
            description: '迟到 10 分钟'
          },
          {
            id: '2',
            employeeId: 'EMP002',
            employeeName: '李四',
            date: '2026-03-16',
            type: 'MISSING_OUT',
            description: '缺下班卡'
          }
        ];
        
        set({ anomalies: mockAnomalies });
      }
    }),
    {
      name: 'attendance-storage',
    }
  )
);

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
