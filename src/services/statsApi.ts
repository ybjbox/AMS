/**
 * 统计报表 API（P1：人员流动统计；P2：考勤看板增强）。
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

/** 近 30 天逐日考勤聚合（P2 看板增强） */
export interface AttendanceDayStat {
  date: string;
  /** 出勤人数（有完整打卡） */
  present: number;
  /** 迟到人数（>15 分钟，与异常分析口径一致） */
  late: number;
  /** 早退人数 */
  early: number;
  /** 缺卡人数（仅一次打卡） */
  missing: number;
  /** 当日应出勤（已排班）人数 */
  scheduled: number;
}

export interface DepartmentRate {
  name: string;
  /** 出勤率 %（一位小数） */
  rate: number;
  attended: number;
  expected: number;
}

export interface AttendanceStats {
  days: AttendanceDayStat[];
  departmentRates: DepartmentRate[];
}

export const fetchAttendanceStats = (): Promise<AttendanceStats> =>
  http.get<AttendanceStats>('/stats/attendance');
