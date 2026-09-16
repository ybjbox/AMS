/**
 * 统计报表 API（P1：人员流动统计）。
 */
import { http } from './api';

export interface WorkforceStats {
  months: string[];
  hires: number[];
  departures: number[];
  departments: { name: string; count: number }[];
  statuses: Record<string, number>;
}

export const fetchWorkforceStats = (): Promise<WorkforceStats> =>
  http.get<WorkforceStats>('/stats/workforce');
