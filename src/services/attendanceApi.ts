import { http, sendBinary, withAuthToken } from './api';
import type { Anomaly, EmployeeSchedule, PunchRecord, Shift } from '../store/useAttendanceStore';

/**
 * 考勤 API — 对接后端 attendanceRouter（/api/attendance/*）。
 *
 * 函数名与原 mockApi 的考勤部分保持一致，store 只需换 import 即可切换数据源。
 * 后端约定：shifts/schedules/records/anomalies 不传分页参数时返回完整数组。
 *
 * 两套写语义别混用（这正是历史上「排班删不掉」的根因）：
 * - PUT /schedules 是 **upsert-only 批量**（未出现的行不会被删）；PUT /records 是
 *   Excel 导入式的**整表替换**（空数组被服务端拒）。
 * - 删除一律走 DELETE：单条 /schedules/:employeeId、/records/:id；整表清空
 *   /schedules、/records 仅 ADMIN。
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
  /** 删除单个员工排班（真删除；PUT 批量是 upsert-only，删不掉行） */
  deleteSchedule: (employeeId: string): Promise<{ success: boolean }> =>
    http.delete<{ success: boolean }>(`/attendance/schedules/${encodeURIComponent(employeeId)}`),
  /** 清空全部排班（整表破坏性操作，服务端仅 ADMIN） */
  clearSchedules: async (): Promise<EmployeeSchedule[]> => {
    await http.delete('/attendance/schedules');
    return http.get<EmployeeSchedule[]>('/attendance/schedules');
  },

  // ---- 打卡记录 ----
  fetchRecords: (): Promise<PunchRecord[]> => http.get<PunchRecord[]>('/attendance/records'),
  updateRecords: async (records: PunchRecord[]): Promise<PunchRecord[]> => {
    await http.put('/attendance/records', { records });
    return http.get<PunchRecord[]>('/attendance/records');
  },
  /** 删除单条打卡记录 */
  deleteRecord: (id: string): Promise<{ success: boolean }> =>
    http.delete<{ success: boolean }>(`/attendance/records/${encodeURIComponent(id)}`),
  /** 清空全部打卡记录（整表破坏性操作，服务端仅 ADMIN） */
  clearRecords: async (): Promise<PunchRecord[]> => {
    await http.delete('/attendance/records');
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

// ---- 批量导入（服务端解析 + 后台任务轮询，与员工导入同一套流程）----

export interface PunchImportRow {
  rowNumber: number;
  data: { employeeId: string; employeeName: string; date: string; time: string };
  errors: string[];
  duplicate: boolean;
}

export interface PunchImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: PunchImportRow[];
}

export interface PunchImportJob {
  id: string;
  username: string;
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  created: number;
  skipped: number;
  error: string;
}

/** 上传 xlsx → 服务端解析 + 逐行校验 + 预览（不落库） */
export const previewPunchImport = (file: File): Promise<PunchImportPreview> =>
  sendBinary<PunchImportPreview>('/api/attendance/records/import', file);

/** 确认导入：立即返回 jobId，后台分块落库；同一分钟的重复行由唯一索引跳过 */
export const commitPunchImport = (rows: PunchImportRow[]): Promise<{ jobId: string }> =>
  http.post<{ jobId: string }>('/attendance/records/import/commit', { rows });

export const getPunchImportJob = (jobId: string): Promise<PunchImportJob> =>
  http.get<PunchImportJob>(`/attendance/records/import/jobs/${encodeURIComponent(jobId)}`);

/** 导入模板下载链接（走 query token，与备份/审计导出同一取道） */
export const punchImportTemplateUrl = (): string =>
  withAuthToken('/api/attendance/records/import/template');
