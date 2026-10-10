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

/** 近 30 天逐日考勤聚合（看板增强；与考勤模块同一套判定） */
export interface AttendanceDayStat {
  date: string;
  /** 判定班次数：对上班并判定成功的班次实例数（热力分母） */
  judged: number;
  /** 出勤人次（同判定班次数） */
  present: number;
  /** 迟到人次（超过 5 分钟与超过 15 分钟都算） */
  late: number;
  /** 早退人次 */
  early: number;
  /** 缺卡人次（缺上班卡 + 缺下班卡） */
  missing: number;
  /** 对不上任何时段的人日数（当天没判定，不等于"没事"） */
  unmatched: number;
  /** 当天有打卡记录的「员工×日」数 */
  punchDays: number;
}

export interface DepartmentRate {
  name: string;
  /** 出勤率 %（一位小数）= 出勤人日 / 应出勤人日 */
  rate: number;
  attended: number;
  expected: number;
}

export interface AttendanceStats {
  days: AttendanceDayStat[];
  departmentRates: DepartmentRate[];
  /** 窗口内最后一次打卡的日期 */
  lastPunchDate: string | null;
  /** 窗口内没有任何打卡的天数 */
  noDataDays: number;
  /** 既没有部门时段也没有排班、没参与判定的人数 */
  noPlanEmployees: number;
  /** 出勤率实际统计的起始日 */
  ratedFrom: string | null;
  /** 出勤率实际统计的截止日（被"最近一次打卡"截断，避免把没数据的将来日算成缺勤） */
  ratedTo: string | null;
}

export const fetchAttendanceStats = (): Promise<AttendanceStats> =>
  http.get<AttendanceStats>('/stats/attendance');
