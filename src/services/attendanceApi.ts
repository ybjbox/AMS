import { http } from './api';
import type { Anomaly, EmployeeSchedule, PunchRecord, Shift } from '../store/useAttendanceStore';

/**
 * 考勤 API — 对接后端 attendanceRouter（/api/attendance/*）。
 *
 * 函数名与原 mockApi 的考勤部分保持一致，store 只需换 import 即可切换数据源。
 * 后端约定：shifts/schedules/records/anomalies 不传分页参数时返回完整数组；
 * PUT /schedules、PUT /records 为批量替换语义（schedules 为 upsert-only），
 * 写入后重新 GET，以服务器状态为准。
 */
/** 月度考勤汇总行（与服务端 MonthlySummaryRow 对齐） */
export interface MonthlySummaryRow {
  employeeId: string;
  employeeName: string;
  department: string;
  workDays: number;
  punchCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  missingCount: number;
}

export interface MonthlySummaryResponse {
  month: string;
  rows: MonthlySummaryRow[];
}

export const attendanceApi = {
  // ---- 班次 ----
  fetchShifts: (): Promise<Shift[]> => http.get<Shift[]>('/attendance/shifts'),
  createShift: (shift: Shift): Promise<Shift> => http.post<Shift>('/attendance/shifts', shift),
  updateShift: (id: string, shift: Partial<Shift>): Promise<Shift> =>
    http.put<Shift>(`/attendance/shifts/${id}`, shift),
  deleteShift: (id: string): Promise<{ success: boolean }> =>
    http.delete<{ success: boolean }>(`/attendance/shifts/${id}`),

  // ---- 排班 ----
  fetchSchedules: (): Promise<EmployeeSchedule[]> =>
    http.get<EmployeeSchedule[]>('/attendance/schedules'),
  updateSchedules: async (schedules: EmployeeSchedule[]): Promise<EmployeeSchedule[]> => {
    await http.put('/attendance/schedules', { schedules });
    return http.get<EmployeeSchedule[]>('/attendance/schedules');
  },

  // ---- 打卡记录 ----
  fetchRecords: (): Promise<PunchRecord[]> => http.get<PunchRecord[]>('/attendance/records'),
  updateRecords: async (records: PunchRecord[]): Promise<PunchRecord[]> => {
    await http.put('/attendance/records', { records });
    return http.get<PunchRecord[]>('/attendance/records');
  },

  // ---- 月度报表 ----
  fetchMonthlySummary: (month: string): Promise<MonthlySummaryResponse> =>
    http.get<MonthlySummaryResponse>(`/attendance/summary?month=${encodeURIComponent(month)}`),

  // ---- 异常 ----
  fetchAnomalies: (): Promise<Anomaly[]> => http.get<Anomaly[]>('/attendance/anomalies'),
  /** 基于打卡记录 + 排班 + 班次时间做真实异常分析，结果持久化并返回 */
  analyzeAnomalies: async (): Promise<Anomaly[]> => {
    const res = await http.post<{ success: boolean; message: string; anomalies: Anomaly[] }>(
      '/attendance/analyze'
    );
    return res.anomalies ?? [];
  },
};
