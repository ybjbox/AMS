import { http } from './api';

export interface MyCoverage {
  latestDate: string | null;
  month: string;
  coveredDays: number;
  elapsedDays: number;
  uncoveredDays: number;
}

export interface MyVerdict {
  date: string;
  verdict: string;
  why: string;
  flag: string;
  isLeave: boolean;
  noRule: boolean;
  /** 这天有没有需要处理的事；月列表只展示 true 的日子，避免休息日被当成「没有打卡」 */
  hasIssue: boolean;
}

export interface MyAnomaly {
  id: string;
  date: string;
  type: string;
  description: string;
  minutes: number | null;
  /** 迟到/早退的原卡时刻，异议表单可直接预填；缺卡为空 */
  suggestedTime: string;
}

export interface MySummary {
  month: string;
  employeeId: string;
  coverage: MyCoverage;
  verdicts: MyVerdict[];
  anomalies: MyAnomaly[];
  counts: { late: number; missing: number };
}

/** 员工自助：所有数据都由服务端按 req.auth.employeeId 收口，前端不传工号 */
export const myApi = {
  summary: (month?: string) => http.get<MySummary>(`/my/summary${month ? `?month=${month}` : ''}`),
  disputes: () => http.get<unknown[]>('/my/disputes'),
};
