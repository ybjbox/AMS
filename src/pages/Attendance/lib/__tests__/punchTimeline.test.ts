/**
 * 个人打卡时间轴的分组口径回归。
 *
 * 排序方向是这里最容易写反的地方：日期要倒序（最近在上），
 * 同一天内的打卡要正序（一天的先后本身是信息）。写反了不会报错，
 * 只会让人读着别扭，所以钉死。
 */
import { describe, it, expect } from 'vitest';
import {
  groupPunchesByDate,
  summarizePunches,
  recordsOfEmployee,
  anomalyDatesFor,
  weekdayOf,
  isWeekend,
} from '../punchTimeline';
import type { PunchRecord } from '@/store/useAttendanceStore';

const p = (over: Partial<PunchRecord> = {}): PunchRecord => ({
  id: 'x',
  employeeId: 'E1',
  employeeName: '张三',
  date: '2026-09-15',
  time: '08:00:00',
  source: '',
  ...over,
});

describe('按天分组', () => {
  it('日期倒序（同一天内正序）', () => {
    const groups = groupPunchesByDate([
      p({ id: '1', date: '2026-09-15', time: '08:00:00' }),
      p({ id: '2', date: '2026-09-17', time: '20:00:00' }),
      p({ id: '3', date: '2026-09-15', time: '02:00:00' }),
      p({ id: '4', date: '2026-09-16', time: '12:00:00' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-09-17', '2026-09-16', '2026-09-15']);
    expect(groups[2].punches.map((x) => x.time)).toEqual(['02:00:00', '08:00:00']);
  });

  it('空输入得到空数组，不炸', () => {
    expect(groupPunchesByDate([])).toEqual([]);
  });

  it('不会改动传入的数组顺序', () => {
    const input = [p({ id: '1', date: '2026-09-15' }), p({ id: '2', date: '2026-09-17' })];
    groupPunchesByDate(input);
    expect(input.map((r) => r.date)).toEqual(['2026-09-15', '2026-09-17']);
  });
});

describe('汇总', () => {
  const groups = groupPunchesByDate([
    p({ id: '1', date: '2026-09-15', time: '08:00:00' }),
    p({ id: '2', date: '2026-09-15', time: '20:00:00' }),
    p({ id: '3', date: '2026-09-16', time: '08:00:00' }),
    p({ id: '4', date: '2026-09-17', time: '08:00:00' }),
    p({ id: '5', date: '2026-09-17', time: '12:00:00' }),
    p({ id: '6', date: '2026-09-17', time: '18:00:00' }),
    p({ id: '7', date: '2026-09-17', time: '22:00:00' }),
  ]);

  it('条数、天数、区间', () => {
    const s = summarizePunches(groups);
    expect(s.total).toBe(7);
    expect(s.days).toBe(3);
    expect(s.lastDate).toBe('2026-09-17'); // 最近
    expect(s.firstDate).toBe('2026-09-15'); // 最早
  });

  it('只打 1 次的人日与打了 4 次以上的人日分别计数', () => {
    const s = summarizePunches(groups);
    expect(s.singlePunchDays).toBe(1); // 09-16
    expect(s.busyDays).toBe(1); // 09-17 四次
  });

  it('空输入的汇总全为 0 / 空串', () => {
    expect(summarizePunches([])).toEqual({
      total: 0,
      days: 0,
      firstDate: '',
      lastDate: '',
      singlePunchDays: 0,
      busyDays: 0,
    });
  });
});

describe('按工号取某人全部记录', () => {
  const all = [
    p({ id: '1', employeeId: 'E1', employeeName: '张三' }),
    p({ id: '2', employeeId: 'E2', employeeName: '李四' }),
    p({ id: '3', employeeId: 'E1', employeeName: '张三' }),
  ];
  it('只挑该工号，且不误伤同名不同号的人', () => {
    expect(recordsOfEmployee(all, 'E1').map((r) => r.id)).toEqual(['1', '3']);
    expect(recordsOfEmployee(all, 'E2').map((r) => r.id)).toEqual(['2']);
    expect(recordsOfEmployee(all, 'E9')).toEqual([]);
  });

  it('异常日期按工号收敛成集合，供时间轴打点', () => {
    const dates = anomalyDatesFor(
      [
        { employeeId: 'E1', date: '2026-09-15' },
        { employeeId: 'E2', date: '2026-09-16' },
        { employeeId: 'E1', date: '2026-09-15' },
      ],
      'E1'
    );
    expect([...dates]).toEqual(['2026-09-15']);
  });
});

describe('星期', () => {
  it('2026-09-15 是周二，2026-09-19 / 20 是周末', () => {
    expect(weekdayOf('2026-09-15')).toBe('二');
    expect(isWeekend('2026-09-15')).toBe(false);
    expect(isWeekend('2026-09-19')).toBe(true);
    expect(isWeekend('2026-09-20')).toBe(true);
  });

  it('日期非法时返回空串而不是 Invalid Date', () => {
    expect(weekdayOf('not-a-date')).toBe('');
    expect(isWeekend('not-a-date')).toBe(false);
  });
});