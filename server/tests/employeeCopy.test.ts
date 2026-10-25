/**
 * 员工端文案层（qa-1 / qa-9）。
 *
 * 两条约束：
 * - 员工端不能出现引擎词（未判定 / 对班 / 班次 / 实例 / 覆盖 / 单卡 / 归上月）；
 * - 摘要卡计数与异常列表必须来自同一份 finding，不能再出现「缺卡 0 次」下面列着缺卡。
 */
import { describe, it, expect } from 'vitest';
import type { DayVerdictRow, InstanceVerdictRow } from '../attendanceDayVerdicts.ts';
import {
  countEmployeeAnomalies,
  employeeAnomalies,
  employeeDayCopy,
} from '../employeeCopy.ts';

const instance = (over: Partial<InstanceVerdictRow> = {}): InstanceVerdictRow => ({
  employeeId: 'E1',
  employeeName: '阿明',
  department: '停车收费组',
  date: '2026-10-01',
  weekday: '周四',
  inReport: true,
  shiftLabel: '小夜班 16:00-24:00',
  times: ['16:03'],
  single: true,
  spanMin: 0,
  spanTxt: '单卡',
  lastOffset: 963,
  cross: true,
  isLeave: false,
  findings: [],
  verdict: '正常',
  why: '引擎原句',
  flag: '单卡',
  late: null,
  early: null,
  window: { start: 960, end: 1440 },
  ...over,
}) as InstanceVerdictRow;

const day = (over: Partial<DayVerdictRow> = {}): DayVerdictRow => ({
  employeeId: 'E1',
  employeeName: '阿明',
  job: '',
  department: '停车收费组',
  date: '2026-10-01',
  weekday: '周四',
  times: ['16:03'],
  instances: [],
  own: [],
  borrowed: [],
  borrowedInMonth: [],
  borrowedPrevMonth: [],
  orphan: [],
  isLeave: false,
  noRule: false,
  monthEdge: false,
  noLaterPunch: false,
  verdict: '缺下班卡',
  why: '小夜班 16:00-24:00：缺下班卡（单卡）；本班归上月',
  flag: '单卡',
  shiftSummary: '',
  spanSummary: '',
  lateText: '',
  earlyText: '',
  missingText: '缺下班卡',
  ...over,
}) as DayVerdictRow;

const BANNED = /未判定|对班|班次|实例|覆盖|单卡|归上月/;

describe('员工端文案', () => {
  it('单卡缺下班卡：人话说「只有一张卡」，不再出现单卡/班次', () => {
    const row = day({
      instances: [instance({ findings: [{ type: 'MISSING_OUT', label: '缺下班卡', minutes: null }] })],
    });
    const copy = employeeDayCopy(row);
    expect(copy.verdict).toBe('缺卡');
    expect(copy.why).toContain('只有 16:03 这一张卡');
    expect(copy.why).toContain('按 16:00-24:00 的班算');
    expect(JSON.stringify(copy)).not.toMatch(BANNED);
    // 缺下班卡没有"原时刻"，不预填、不拿上班卡时间冒充
    expect(employeeAnomalies(row)[0].suggestedTime).toBe('');
  });

  it('迟到用「比 16:00 晚了 N 分钟」，异常描述不带引擎词', () => {
    const row = day({
      times: ['16:23'],
      instances: [
        instance({
          times: ['16:23'],
          findings: [{ type: 'LATE_15', label: '迟到(>15分)', minutes: 23 }],
          late: 23,
        }),
      ],
    });
    const copy = employeeDayCopy(row);
    expect(copy.verdict).toBe('迟到');
    expect(copy.why).toContain('比 16:00 的上班时间晚了 23 分钟');
    const anomalies = employeeAnomalies(row);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].description).toBe('迟到 23 分钟 · 按 16:00-24:00 的班');
    // 迟到能确定原卡时刻 → 异议表单直接预填；缺卡不能猜
    expect(anomalies[0].suggestedTime).toBe('16:23');
    expect(JSON.stringify({ copy, anomalies })).not.toMatch(BANNED);
    expect(countEmployeeAnomalies(anomalies)).toEqual({ late: 1, missing: 0 });
  });

  it('早退用「比 24:00 早了 N 分钟」', () => {
    const row = day({
      times: ['23:20'],
      instances: [
        instance({
          times: ['23:20'],
          findings: [{ type: 'EARLY_LEAVE', label: '早退', minutes: 40 }],
          early: 40,
        }),
      ],
    });
    expect(employeeDayCopy(row).why).toContain('比 24:00 的下班时间早了 40 分钟');
    expect(employeeAnomalies(row)[0].description).toBe('早退 40 分钟 · 按 16:00-24:00 的班');
  });

  it('跨月卡：说「算到上月最后一天那个班」，并且不算异常', () => {
    const row = day({
      times: ['00:02'],
      instances: [instance({ times: ['00:02'], findings: [] })],
      borrowedPrevMonth: ['00:02'],
    });
    const copy = employeeDayCopy(row);
    expect(copy.verdict).toBe('正常');
    expect(copy.why).toContain('算到上月最后一天那个班');
    expect(employeeAnomalies(row)).toHaveLength(0);
    expect(JSON.stringify(copy)).not.toMatch(BANNED);
  });

  it('未配时段 / 请假 / 无打卡：都有独立人话，不显示引擎状态', () => {
    expect(employeeDayCopy(day({ noRule: true })).verdict).toBe('暂时判不了');
    expect(employeeDayCopy(day({ isLeave: true })).verdict).toBe('请假');
    const empty = day({ times: [], instances: [] });
    expect(employeeDayCopy(empty).verdict).toBe('没有打卡');
    expect(employeeAnomalies(empty)).toHaveLength(0);
    for (const copy of [
      employeeDayCopy(day({ noRule: true })),
      employeeDayCopy(day({ isLeave: true })),
      employeeDayCopy(empty),
    ]) {
      expect(JSON.stringify(copy)).not.toMatch(BANNED);
    }
  });

  it('同一天多个问题：计数与列表同源', () => {
    const row = day({
      times: ['16:23'],
      instances: [
        instance({
          times: ['16:23'],
          findings: [
            { type: 'LATE_5', label: '迟到(>5分)', minutes: 8 },
            { type: 'MISSING_OUT', label: '缺下班卡', minutes: null },
          ],
          late: 8,
        }),
      ],
    });
    const copy = employeeDayCopy(row);
    expect(copy.verdict).toBe('迟到、缺卡');
    const anomalies = employeeAnomalies(row);
    expect(anomalies).toHaveLength(2);
    expect(countEmployeeAnomalies(anomalies)).toEqual({ late: 1, missing: 1 });
    expect(countEmployeeAnomalies([])).toEqual({ late: 0, missing: 0 });
  });
});
