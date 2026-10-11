/**
 * 员工维度汇总的回归。
 *
 * 这个口径直接决定主表上每个数字，所以最容易错的两处必须钉死：
 *  1. 出勤天数按日期**去重**（一天两班就有两条卡，直接数条数会翻倍）
 *  2. 一律按工号分组（姓名会重名、也会改名，不能当主键）
 */
import { describe, it, expect } from 'vitest';
import {
  rollupByEmployee,
  sortRollup,
  filterByAnomaly,
  rollupTotals,
  daysSinceLast,
} from '../employeeRollup';
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';

const rec = (id: string, date: string, time: string, over: Partial<PunchRecord> = {}): PunchRecord => ({
  id,
  employeeId: 'E1',
  employeeName: '张三',
  date,
  time,
  source: '',
  ...over,
});

const anom = (id: string, employeeId: string, type: Anomaly['type'], date = '2026-09-02'): Anomaly => ({
  id,
  employeeId,
  employeeName: '张三',
  date,
  type,
  description: '',
});

describe('汇总', () => {
  it('出勤天数按日期去重，一天两班只算一天', () => {
    const rows = rollupByEmployee([
      rec('1', '2026-09-01', '08:00'),
      rec('2', '2026-09-01', '20:00'),
      rec('3', '2026-09-02', '08:00'),
    ]);
    expect(rows[0].records).toBe(3);
    expect(rows[0].days).toBe(2);
  });

  it('区间取最早/最近，跨月也没问题', () => {
    const rows = rollupByEmployee([
      rec('1', '2026-10-01', '08:00'),
      rec('2', '2026-08-31', '08:00'),
      rec('3', '2026-09-15', '08:00'),
    ]);
    expect(rows[0].firstDate).toBe('2026-08-31');
    expect(rows[0].lastDate).toBe('2026-10-01');
  });

  it('来源构成分开计数', () => {
    const rows = rollupByEmployee([
      rec('1', '2026-09-01', '08:00', { source: 'wecom' }),
      rec('2', '2026-09-01', '20:00'),
      rec('3', '2026-09-02', '08:00', { source: 'wecom' }),
    ]);
    expect(rows[0].wecomRecords).toBe(2);
    expect(rows[0].records).toBe(3);
  });

  it('按工号分组：同名不同号必须是两行', () => {
    const rows = rollupByEmployee([
      rec('1', '2026-09-01', '08:00', { employeeId: 'E1', employeeName: '重名' }),
      rec('2', '2026-09-01', '08:00', { employeeId: 'E2', employeeName: '重名' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.employeeId).sort()).toEqual(['E1', 'E2']);
  });

  it('改名后取最新姓名，不按字典序猜', () => {
    const rows = rollupByEmployee([
      rec('1', '2026-08-31', '08:00', { employeeName: '旧名' }),
      rec('2', '2026-09-02', '08:00', { employeeName: '新名' }),
      rec('3', '2026-09-03', '08:00', { employeeName: '新名' }),
    ]);
    expect(rows[0].employeeName).toBe('新名');
  });

  it('异常按类型拆开', () => {
    const rows = rollupByEmployee([rec('1', '2026-09-02', '08:00')], [
      anom('a1', 'E1', 'LATE_5'),
      anom('a2', 'E1', 'LATE_15'),
      anom('a3', 'E1', 'MISSING_IN'),
      anom('a4', 'E1', 'EARLY_LEAVE'),
    ]);
    expect(rows[0].anomalies).toBe(4);
    expect(rows[0].late).toBe(2);
    expect(rows[0].missing).toBe(1);
    expect(rows[0].early).toBe(1);
  });

  it('当前范围内没有打卡的异常不计入（否则数字对不上）', () => {
    const rows = rollupByEmployee([rec('1', '2026-09-02', '08:00', { employeeId: 'E1' })], [
      anom('a1', 'E9', 'LATE_5'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].anomalies).toBe(0);
  });

  it('空输入返回空数组', () => {
    expect(rollupByEmployee([])).toEqual([]);
  });
});

describe('排序', () => {
  const rows = rollupByEmployee([
    rec('1', '2026-09-01', '08:00', { employeeId: 'E1', employeeName: '甲' }),
    rec('2', '2026-09-01', '08:00', { employeeId: 'E1', employeeName: '甲' }),
    rec('3', '2026-09-01', '08:00', { employeeId: 'E2', employeeName: '乙' }),
    rec('4', '2026-09-01', '08:00', { employeeId: 'E2', employeeName: '乙' }),
    rec('5', '2026-09-01', '08:00', { employeeId: 'E2', employeeName: '乙' }),
    rec('6', '2026-09-01', '08:00', { employeeId: 'E3', employeeName: '丙' }),
  ]);

  // 中文按拼音排（bing < jia < yi），所以升序是 丙 → 甲 → 乙，
// 不是字典序也不是 unicode 序 —— 这样翻名单才符合"找人的直觉"
  it('按姓名可升可降（中文按拼音）', () => {
    expect(sortRollup(rows, 'name', 'asc').map((r) => r.employeeName)).toEqual(['丙', '甲', '乙']);
    expect(sortRollup(rows, 'name', 'desc').map((r) => r.employeeName)).toEqual(['乙', '甲', '丙']);
  });

  it('按条数倒序：乙(3) > 甲(2) > 丙(1)', () => {
    expect(sortRollup(rows, 'records', 'desc').map((r) => r.employeeName)).toEqual(['乙', '甲', '丙']);
  });

  it('同值时顺序稳定（不随调用抖动）', () => {
    const once = sortRollup(rows, 'records', 'desc').map((r) => r.employeeId);
    const twice = sortRollup(rows, 'records', 'desc').map((r) => r.employeeId);
    expect(once).toEqual(twice);
  });

  it('不改动传入的数组', () => {
    const before = rows.map((r) => r.employeeId);
    sortRollup(rows, 'records', 'desc');
    expect(rows.map((r) => r.employeeId)).toEqual(before);
  });
});

describe('只看有异常', () => {
  const rows = rollupByEmployee(
    [
      rec('1', '2026-09-01', '08:00', { employeeId: 'E1' }),
      rec('2', '2026-09-01', '08:00', { employeeId: 'E2' }),
    ],
    [anom('a1', 'E2', 'LATE_5')]
  );
  it('开则只留有异常的', () => {
    expect(filterByAnomaly(rows, true).map((r) => r.employeeId)).toEqual(['E2']);
  });
  it('关则全留', () => {
    expect(filterByAnomaly(rows, false)).toHaveLength(2);
  });
});

describe('合计', () => {
  it('逐项加总，恒等于表里各行之和', () => {
    const rows = rollupByEmployee(
      [
        rec('1', '2026-09-01', '08:00', { employeeId: 'E1', source: 'wecom' }),
        rec('2', '2026-09-01', '20:00', { employeeId: 'E1' }),
        rec('3', '2026-09-02', '08:00', { employeeId: 'E2' }),
      ],
      [anom('a1', 'E1', 'LATE_5')]
    );
    const t = rollupTotals(rows);
    expect(t).toEqual({ employees: 2, records: 3, days: 2, anomalies: 1, wecomRecords: 1 });
  });

  it('空表合计全 0', () => {
    expect(rollupTotals([])).toEqual({ employees: 0, records: 0, days: 0, anomalies: 0, wecomRecords: 0 });
  });
});

describe('距今多少天没打卡', () => {
  const today = new Date(2026, 9, 11); // 2026-10-11
  it('今天来过是 0', () => {
    expect(daysSinceLast('2026-10-11', today)).toBe(0);
  });
  it('间隔天数正确', () => {
    expect(daysSinceLast('2026-10-01', today)).toBe(10);
    expect(daysSinceLast('2026-08-31', today)).toBe(41);
  });
  it('空日期或非法日期返回 null，不返回 NaN', () => {
    expect(daysSinceLast('', today)).toBeNull();
    expect(daysSinceLast('not-a-date', today)).toBeNull();
  });
});