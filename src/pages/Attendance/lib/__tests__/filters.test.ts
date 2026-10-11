/**
 * 考勤筛选口径的回归（2026-10-11 重排时新增）。
 *
 * 这三个函数同时喂给筛选栏的命中数、表格的分页总数和空状态提示 ——
 * 只要有一处自己重写一遍筛选，数字就会互相打架。所以口径必须有单测钉住。
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_RECORD_FILTER,
  filterRecords,
  isRecordFilterActive,
  countPunchDays,
  filterAnomalies,
  anomalyGroupCounts,
  anomalyGroupOf,
  anomalyTone,
} from '../filters';
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';

const rec = (over: Partial<PunchRecord> = {}): PunchRecord => ({
  id: 'r1',
  employeeId: '1001',
  employeeName: '张三',
  date: '2026-09-01',
  time: '08:00:00',
  source: '',
  ...over,
});

const anom = (over: Partial<Anomaly> = {}): Anomaly => ({
  id: 'a1',
  employeeId: '1001',
  employeeName: '张三',
  date: '2026-09-01',
  type: 'LATE_5',
  description: '迟到 6 分钟',
  ...over,
});

describe('打卡记录筛选', () => {
  const rows = [
    rec({ id: '1', employeeId: '1001', employeeName: '张三', date: '2026-09-01', source: 'wecom' }),
    rec({ id: '2', employeeId: '1002', employeeName: '李四', date: '2026-09-05', source: '' }),
    rec({ id: '3', employeeId: '1003', employeeName: '王五', date: '2026-10-01', source: 'wecom' }),
  ];

  it('空条件原样返回（不做无谓拷贝，也不改变顺序）', () => {
    expect(filterRecords(rows, EMPTY_RECORD_FILTER)).toEqual(rows);
  });

  it('姓名与工号都参与匹配，且大小写不敏感', () => {
    expect(filterRecords(rows, { ...EMPTY_RECORD_FILTER, query: '李' }).map((r) => r.id)).toEqual(['2']);
    expect(filterRecords(rows, { ...EMPTY_RECORD_FILTER, query: '1003' }).map((r) => r.id)).toEqual(['3']);
  });

  it('日期区间按闭区间过滤（零填充定宽，字符串比较即日期比较）', () => {
    const f = { ...EMPTY_RECORD_FILTER, dateFrom: '2026-09-01', dateTo: '2026-09-05' };
    expect(filterRecords(rows, f).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('起止填反时按交换处理，而不是静默返回空表', () => {
    const f = { ...EMPTY_RECORD_FILTER, dateFrom: '2026-09-05', dateTo: '2026-09-01' };
    expect(filterRecords(rows, f).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('来源筛选：wecom 只认 wecom，manual 认其余一切（含空串历史行）', () => {
    expect(filterRecords(rows, { ...EMPTY_RECORD_FILTER, source: 'wecom' }).map((r) => r.id)).toEqual(['1', '3']);
    expect(filterRecords(rows, { ...EMPTY_RECORD_FILTER, source: 'manual' }).map((r) => r.id)).toEqual(['2']);
  });

  it('多条件取交集', () => {
    const f = { ...EMPTY_RECORD_FILTER, query: '100', dateFrom: '2026-09-01', dateTo: '2026-09-30', source: 'wecom' as const };
    expect(filterRecords(rows, f).map((r) => r.id)).toEqual(['1']);
  });

  it('isRecordFilterActive 与 filterRecords 的"是否走慢路径"一致', () => {
    expect(isRecordFilterActive(EMPTY_RECORD_FILTER)).toBe(false);
    expect(isRecordFilterActive({ ...EMPTY_RECORD_FILTER, query: ' ' })).toBe(false);
    expect(isRecordFilterActive({ ...EMPTY_RECORD_FILTER, dateFrom: '2026-09-01' })).toBe(true);
    expect(isRecordFilterActive({ ...EMPTY_RECORD_FILTER, source: 'wecom' })).toBe(true);
  });
});

describe('出勤人次口径', () => {
  it('按「员工 × 日期」去重，一天多卡只算一次', () => {
    expect(
      countPunchDays([
        rec({ id: '1', date: '2026-09-01', time: '08:00:00' }),
        rec({ id: '2', date: '2026-09-01', time: '20:00:00' }),
        rec({ id: '3', date: '2026-09-02' }),
      ])
    ).toBe(2);
  });

  it('跨零点班次仍算一天（次日 00:5x 的下班卡归前一天）', () => {
    expect(countPunchDays([rec({ id: '1', date: '2026-09-01' }), rec({ id: '2', date: '2026-09-02' })])).toBe(2);
  });
});

describe('异常筛选与分组', () => {
  const rows = [
    anom({ id: '1', employeeName: '张三', type: 'LATE_5' }),
    anom({ id: '2', employeeName: '李四', type: 'LATE_15' }),
    anom({ id: '3', employeeName: '王五', type: 'MISSING_IN' }),
    anom({ id: '4', employeeName: '赵六', type: 'MISSING_OUT' }),
    anom({ id: '5', employeeName: '孙七', type: 'EARLY_LEAVE' }),
  ];

  it('按处置方式归组：迟到两档合一、缺卡两档合一', () => {
    expect(anomalyGroupOf('LATE_5')).toBe('late');
    expect(anomalyGroupOf('LATE_15')).toBe('late');
    expect(anomalyGroupOf('MISSING_IN')).toBe('missing');
    expect(anomalyGroupOf('MISSING_OUT')).toBe('missing');
    expect(anomalyGroupOf('EARLY_LEAVE')).toBe('early');
  });

  it('分组计数与过滤结果条数一致（筛选栏徽章不能和表格对不上）', () => {
    const counts = anomalyGroupCounts(rows);
    expect(counts).toEqual({ all: 5, late: 2, missing: 2, early: 1 });
    expect(filterAnomalies(rows, '', 'late')).toHaveLength(counts.late);
    expect(filterAnomalies(rows, '', 'missing')).toHaveLength(counts.missing);
    expect(filterAnomalies(rows, '', 'early')).toHaveLength(counts.early);
  });

  it('搜索与分组可叠加', () => {
    expect(filterAnomalies(rows, '张', 'all').map((a) => a.id)).toEqual(['1']);
    expect(filterAnomalies(rows, '张', 'missing')).toHaveLength(0);
  });

  it('缺卡走危险色，迟到走警示色，早退走中性', () => {
    expect(anomalyTone('MISSING_IN')).toBe('destructive');
    expect(anomalyTone('LATE_15')).toBe('warning');
    expect(anomalyTone('EARLY_LEAVE')).toBe('neutral');
  });
});