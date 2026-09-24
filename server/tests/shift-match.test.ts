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
  crossesMidnight,
  formatWorkdays,
  judgeDay,
  matchShift,
  resolveDay,
  resolveInstances,
  shiftWindow,
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

describe('三班倒与跨午夜交接', () => {
  const TUE = '2026-09-22';
  const threeShifts = [
    rule('夜班', '00:00', '08:00'),
    rule('早班', '08:00', '16:00'),
    rule('中班', '16:00', '00:00'),
  ];

  it('shiftWindow：24 点班结束于 1440，真跨日班结束于次日分钟数', () => {
    expect(shiftWindow({ startTime: '16:00', endTime: '00:00' })).toEqual({ start: 960, end: 1440 });
    expect(shiftWindow({ startTime: '20:00', endTime: '04:00' })).toEqual({ start: 1200, end: 1680 });
    expect(shiftWindow({ startTime: '09:00', endTime: '18:00' })).toEqual({ start: 540, end: 1080 });
    expect(crossesMidnight({ startTime: '16:00', endTime: '00:00' })).toBe(true);
    expect(crossesMidnight({ startTime: '09:00', endTime: '18:00' })).toBe(false);
  });

  it('中班的人凌晨 00:03 打下班卡：仍是一个实例，归属前一天，不算早退也不缺卡', () => {
    const out = resolveInstances(threeShifts, [
      { date: MON, time: '15:58' },
      { date: TUE, time: '00:03' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('judged');
    if (out[0].kind === 'judged') {
      expect(out[0].date).toBe(MON);
      expect(out[0].candidate.name).toBe('中班');
      expect(out[0].judgement.findings).toEqual([]);
    }
  });

  it('夜班的人 00:02 上班、08:05 下班：归属打当天，与中班的人互不污染', () => {
    const out = resolveInstances(threeShifts, [
      { date: TUE, time: '00:02' },
      { date: TUE, time: '08:05' },
    ]);
    expect(out).toHaveLength(1);
    if (out[0].kind === 'judged') {
      expect(out[0].date).toBe(TUE);
      expect(out[0].candidate.name).toBe('夜班');
      expect(out[0].judgement.findings).toEqual([]);
    }
  });

  it('真跨日班（20:00–04:00）的迟到与早退按绝对分钟算', () => {
    const out = resolveInstances([rule('跨日夜班', '20:00', '04:00')], [
      { date: MON, time: '20:20' },
      { date: TUE, time: '03:40' },
    ]);
    expect(out[0].kind).toBe('judged');
    if (out[0].kind === 'judged') {
      expect(out[0].judgement.findings.map((f) => [f.type, f.minutes])).toEqual([
        ['LATE_15', 20],
        ['EARLY_LEAVE', 20],
      ]);
    }
  });

  it('只有一张 15:50 的卡：按 16:00–00:00 判缺下班卡（不是缺上班卡）', () => {
    const out = resolveInstances(threeShifts, [{ date: MON, time: '15:50' }]);
    expect(out[0].kind === 'judged' && out[0].judgement.findings[0].type).toBe('MISSING_OUT');
  });

  it('连上两个整点班（16:00 上班、次日 08:00 才走）不会被合成一个实例', () => {
    const out = resolveInstances(threeShifts, [
      { date: MON, time: '15:59' },
      { date: TUE, time: '00:01' },
      { date: TUE, time: '07:59' },
    ]);
    // 00:01 归中班（下班卡），07:59 归早班（上班卡），早班缺下班卡
    expect(out.map((o) => `${o.kind}:${o.date}`)).toEqual([`judged:${MON}`, `judged:${TUE}`]);
    const second = out[1];
    if (second.kind === 'judged') {
      expect(second.candidate.name).toBe('早班');
      expect(second.judgement.findings[0].type).toBe('MISSING_OUT');
    }
  });

  it('对不上任何班的锚点报 unmatched，而不是硬塞一个班', () => {
    const out = resolveInstances(threeShifts, [{ date: MON, time: '11:30' }]);
    expect(out[0]?.kind).toBe('unmatched');
    if (out[0]?.kind === 'unmatched') expect(out[0].reason).toMatch(/未对上任何班/u);
  });

  it('凌晨 00:00 整点的卡按"是否已有首卡"归属：中班的人它是末卡，没有首卡的人它是锚点', () => {
    const handover = resolveInstances(threeShifts, [
      { date: MON, time: '16:00' },
      { date: TUE, time: '00:00' },
    ]);
    expect(handover.map((o) => `${o.kind}:${o.date}`)).toEqual([`judged:${MON}`]);
    if (handover[0].kind === 'judged') {
      expect(handover[0].candidate.name).toBe('中班');
      expect(handover[0].judgement.findings).toEqual([]);
    }
    const fresh = resolveInstances(threeShifts, [{ date: TUE, time: '00:00' }]);
    expect(fresh[0].kind === 'judged' && fresh[0].candidate.name).toBe('夜班');
    expect(fresh[0].kind === 'judged' && fresh[0].date).toBe(TUE);
  });

  it('整月连排：每个实例的迟到分钟按自己那天算，不被起始日的偏移污染', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03'];
    const out = resolveInstances(
      [rule('行政班', '09:00', '18:00')],
      days.flatMap((date) => [
        { date, time: '09:20' },
        { date, time: '18:00' },
      ])
    );
    expect(out.map((o) => `${o.kind}:${o.date}`)).toEqual(days.map((d) => `judged:${d}`));
    for (const o of out) {
      if (o.kind === 'judged') {
        expect(o.judgement.findings.map((f) => [f.type, f.minutes])).toEqual([['LATE_15', 20]]);
      }
    }
  });
});
