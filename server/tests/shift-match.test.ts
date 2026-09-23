/**
 * 自动对班内核（server/shiftMatch.ts）的纯函数回归。
 *
 * 这批用例是"各部门上班时间段 + 按打卡时间对班"这个形态的全部判据，
 * 所以宁可穷一点：多条时段之间怎么选、什么时候宁可不判、缺卡与迟到早退怎么分档，
 * 都以这里为唯一真相（异常分析与月报都跑同一份实现）。
 */
import { describe, it, expect } from 'vitest';
import {
  MATCH_TOLERANCE_MINUTES,
  candidateFromShift,
  formatWorkdays,
  judgeDay,
  matchShift,
  resolveDay,
  toMinutes,
  weekdayOf,
  type ShiftCandidate,
} from '../shiftMatch.ts';

const WEEKDAYS = [1, 2, 3, 4, 5];

function rule(name: string, startTime: string, endTime: string, workdays = WEEKDAYS): ShiftCandidate {
  return { label: `行政部 · ${name} ${startTime}-${endTime}`, sourceDepartment: '行政部', name, startTime, endTime, workdays };
}

/** 2026-09-21 周一 / 09-26 周六 / 09-27 周日（本地日历日，不依赖运行时区） */
const MON = '2026-09-21';
const SAT = '2026-09-26';

describe('日期与时间解析', () => {
  it('weekdayOf：周一=1 … 周日=7，且接受 HH:mm 与 HH:mm:ss 两种时间形状', () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SAT)).toBe(6);
    expect(weekdayOf('2026-09-27')).toBe(7);
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('09:00:33')).toBe(540);
  });

  it('formatWorkdays：整周显示"每天"，其余按周一到周日顺序列出', () => {
    expect(formatWorkdays([3, 1, 2, 4, 5, 6, 7])).toBe('每天');
    expect(formatWorkdays([6, 1])).toBe('周一、周六');
    expect(formatWorkdays([])).toBe('未设置');
  });
});

describe('对班选择', () => {
  it('两条时段并存时按首卡挑最近的一条', () => {
    const candidates = [rule('早班', '08:00', '17:00'), rule('正常班', '09:00', '18:00')];
    expect(matchShift(candidates, { date: MON, times: ['08:05', '17:10'] })).toMatchObject({
      candidate: { name: '早班' },
      lateDeltaMinutes: 5,
    });
    expect(matchShift(candidates, { date: MON, times: ['09:05', '18:10'] })).toMatchObject({
      candidate: { name: '正常班' },
      lateDeltaMinutes: 5,
    });
  });

  it('只看首卡当锚点：加班到深夜仍对得上原来那条班', () => {
    const candidates = [rule('早班', '08:00', '17:00'), rule('正常班', '09:00', '18:00')];
    const matched = matchShift(candidates, { date: MON, times: ['09:02', '22:30'] });
    expect(matched).toMatchObject({ candidate: { name: '正常班' } });
  });

  it('偏差完全相同时按"上班时间更早"定序，保证同输入同结果（可复算）', () => {
    const candidates = [rule('B班', '10:00', '19:00'), rule('A班', '08:00', '17:00')];
    const matched = matchShift(candidates, { date: MON, times: ['09:00', '18:00'] });
    expect(matched).toMatchObject({ candidate: { name: 'A班' } });
  });

  it('首卡与最近的上班时间差超过容忍时宁可不判（部门时段）', () => {
    const candidates = [rule('正常班', '09:00', '18:00')];
    const matched = matchShift(candidates, { date: MON, times: ['14:00', '17:30'] });
    expect(matched.kind).toBe('no-match');
    if (matched.kind === 'no-match') {
      expect(matched.closestDelta).toBe(14 * 60 - 9 * 60);
      expect(matched.tolerance).toBe(MATCH_TOLERANCE_MINUTES);
    }
  });

  it('逐日排班是明确指定，不受容忍限制：15:00 首卡照样判缺上班卡 + 早退', () => {
    const scheduled = candidateFromShift({ name: '正常班', startTime: '09:00', endTime: '18:00' });
    const outcome = resolveDay([scheduled], { date: MON, times: ['15:00'] });
    expect(outcome.kind).toBe('judged');
    if (outcome.kind === 'judged') {
      expect(outcome.judgement.findings.map((f) => f.type)).toEqual(['MISSING_IN']);
    }
  });

  it('当天不在任何时段的工作日内 → no-workday（周六上班的部门要能单独配）', () => {
    const weekdaysOnly = [rule('正常班', '09:00', '18:00')];
    expect(matchShift(weekdaysOnly, { date: SAT, times: ['09:02', '17:30'] })).toMatchObject({ kind: 'no-workday' });
    const saturdayRule = [rule('周六班', '09:00', '12:00', [6])];
    expect(matchShift(saturdayRule, { date: SAT, times: ['09:02', '12:10'] })).toMatchObject({
      candidate: { name: '周六班' },
    });
  });
});

describe('判定分档', () => {
  const shift = rule('正常班', '09:00', '18:00');

  it('迟到 6 分钟记 LATE_5、16 分钟记 LATE_15，描述里带对班来源', () => {
    expect(judgeDay(shift, MON, ['09:06', '18:00']).findings.map((f) => f.type)).toEqual(['LATE_5']);
    const serious = judgeDay(shift, MON, ['09:16', '18:00']).findings[0];
    expect(serious).toMatchObject({ type: 'LATE_15', minutes: 16 });
    expect(serious.description).toContain('行政部 · 正常班');
  });

  it('迟到 + 早退同日两条都记（不收窄历史行为）', () => {
    const findings = judgeDay(shift, MON, ['09:20', '17:00']).findings;
    expect(findings.map((f) => f.type)).toEqual(['LATE_15', 'EARLY_LEAVE']);
  });

  it('只有一张卡：中点前判缺下班卡，中点后判缺上班卡', () => {
    expect(judgeDay(shift, MON, ['08:50']).findings[0].type).toBe('MISSING_OUT');
    expect(judgeDay(shift, MON, ['14:00']).findings[0].type).toBe('MISSING_IN');
  });

  it('准时且不早退 → 无异常', () => {
    expect(judgeDay(shift, MON, ['08:55', '18:05']).findings).toEqual([]);
  });

  it('resolveDay 未对上班时给出人能看懂的原因，而不是静默无异常', () => {
    const out = resolveDay([shift], { date: MON, times: ['14:00', '17:00'] });
    expect(out.kind).toBe('no-match');
    if (out.kind === 'no-match') expect(out.reason).toMatch(/未对上任何班.*300 分钟.*180 分钟/u);
    const off = resolveDay([shift], { date: SAT, times: ['09:00', '18:00'] });
    expect(off.kind === 'no-workday' && off.reason).toMatch(/不在已配置时段的工作日/u);
  });
});
