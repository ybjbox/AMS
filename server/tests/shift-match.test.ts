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
  buildShiftInstances,
  candidateFromShift,
  crossesMidnight,
  formatWorkdays,
  judgeDay,
  judgeOffsets,
  matchShift,
  resolveDay,
  resolveInstances,
  shiftWindow,
  toMinutes,
  weekdayOf,
  type ShiftCandidate,
} from '../shiftMatch.ts';

const WEEKDAYS = [1, 2, 3, 4, 5];

function rule(name: string, startTime: string, endTime: string, workdays = WEEKDAYS, assumeMissingIn?: boolean, overtimeGraceMinutes?: number): ShiftCandidate {
  return { label: `行政部 · ${name} ${startTime}-${endTime}`, sourceDepartment: '行政部', name, startTime, endTime, workdays, assumeMissingIn, overtimeGraceMinutes };
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

  /**
   * 边界钉死：阈值是**严格大于**，所以 5 分整和 15 分整都不算迟到。
   *
   * 这条是为了守住界面上的档位文案 —— 标签写「迟到超过 5 分钟」，
   * 若哪天有人把 `>` 改成 `>=`，标签就会开始骗人。改阈值时这里必须一起改。
   */
  it('阈值是严格大于：5 分整、15 分整都不判迟到', () => {
    expect(judgeDay(shift, MON, ['09:04', '18:00']).findings.map((f) => f.type)).toEqual([]);
    expect(judgeDay(shift, MON, ['09:05', '18:00']).findings.map((f) => f.type)).toEqual([]);
    expect(judgeDay(shift, MON, ['09:06', '18:00']).findings.map((f) => f.type)).toEqual(['LATE_5']);
    expect(judgeDay(shift, MON, ['09:15', '18:00']).findings.map((f) => f.type)).toEqual(['LATE_5']);
    expect(judgeDay(shift, MON, ['09:16', '18:00']).findings.map((f) => f.type)).toEqual(['LATE_15']);
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
    if (out.kind === 'no-match') expect(out.reason).toMatch(/没能对上班次.*300 分钟.*180 分钟/u);
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
    if (out[0]?.kind === 'unmatched') expect(out[0].reason).toMatch(/没能对上班次/u);
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

  /**
   * 上班时间相同的两个班次（2026-10-09 业务口径引入）。
   *
   * 判据：末卡 ≥ 某条下班点 → 取下班点离末卡最近的那条；末卡早于所有下班点 →
   * 取下班点最晚的那条并记「缺下班卡」，不下早退判语。
   */
  describe('同一起点班次（08:00 常规 / 08:00 连班）', () => {
    const two = [rule('常规班次', '08:00', '18:00'), rule('连班', '08:00', '16:00')];
    const punch = (d: string, times: string[]) => times.map((time) => ({ date: d, time }));

    it('干到 18:00 判常规班次，不是连班（反过来会算出 2 小时早退）', () => {
      const out = resolveInstances(two, punch(MON, ['08:07', '12:12', '14:32', '18:00']));
      expect(out).toHaveLength(1);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('常规班次');
      expect(only.judgement.findings.map((f) => f.type)).not.toContain('EARLY_LEAVE');
    });

    it('18:04 这种刚过下班点的卡被收进实例，不再整批丢成未对班', () => {
      const out = resolveInstances(two, punch(MON, ['08:00', '12:02', '14:37', '18:04']));
      expect(out.every((o) => o.kind === 'judged')).toBe(true);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('常规班次');
      expect(only.judgement.findings).toEqual([]);
    });

    it('16:16 走判连班（业务口径：干到 16 点后走算连班，不算常规班次的早退）', () => {
      const out = resolveInstances(two, punch(MON, ['08:10', '16:16']));
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('连班');
      // 08:10 上班本身迟到 10 分钟（LATE_5）；关键是**没有**早退那条
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['LATE_5']);
    });

    it('14:33 走判常规班次 + 缺下班卡，不下早退判语（分不清早走还是忘打下班卡）', () => {
      const out = resolveInstances(two, punch(MON, ['08:05', '12:02', '14:33']));
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('常规班次');
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['MISSING_OUT']);
    });

    it('迟到仍按首卡算，不受同起点并列判据影响', () => {
      const out = resolveInstances(two, punch(MON, ['08:20', '18:10']));
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['LATE_15']);
    });

    /**
     * 单条时段：早于下班点的判语按幅度分档（取代「单条时段一律判早退」的旧规则）。
     * 业务口径 2026-10-10：文员 14:00 走（早退 240 分）应记「缺下班卡」，
     * 因为分不清是早走还是忘打下班卡，不下早退判语。
     */
    it('单条时段：早退在 60 分钟内判早退，超过则判缺下班卡', () => {
      const one = [rule('单班', '08:00', '18:00', WEEKDAYS)];
      const near = resolveInstances(one, punch(MON, ['08:05', '17:30']));   // 早退 30 分
      expect(near[0].kind === 'judged' && near[0].judgement.findings.map((f) => f.type)).toEqual(['EARLY_LEAVE']);
      const far = resolveInstances(one, punch(MON, ['08:05', '15:00']));    // 早退 180 分
      expect(far[0].kind === 'judged' && far[0].judgement.findings.map((f) => f.type)).toEqual(['MISSING_OUT']);
    });
  });

  /**
   * 窗口平移 ±1440：00:00 上班的人在 23:45 就来打卡是常态（消防/停车的大夜班）。
   * 缺这一步时 |1425−0|=1425，永远配不上大夜，会被拆成「小夜班缺上班卡 + 早班缺下班卡」两条假缺卡。
   */
  describe('跨午夜的上班卡（23:4x 打，次日 0x~8x 下）', () => {
    const night = [rule('大夜', '00:00', '08:00'), rule('早班', '08:00', '16:00'), rule('小夜班', '16:00', '24:00')];

    it('23:45 上班 + 次日 08:13 下班 判成**一个**大夜班，不再拆成两条假缺卡', () => {
      const out = resolveInstances(night, [
        { date: MON, time: '23:45' },
        { date: TUE, time: '08:13' },
      ]);
      expect(out).toHaveLength(1);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('大夜');
      expect(only.judgement.findings).toEqual([]);
    });

    it('08:13 的下班卡归到大夜班（跨零点），不是次日早班的上班卡', () => {
      const inst = buildShiftInstances(night, [
        { date: MON, time: '23:45' },
        { date: TUE, time: '08:13' },
      ]).instances[0];
      expect(inst.date).toBe(MON);          // 归属日 = 上班卡那天
      expect(inst.offsets[0]).toBe(23 * 60 + 45);
      expect(inst.offsets[1]).toBe(1440 + 8 * 60 + 13);
    });

    it('23:45 算「早到」不记迟到；07:55 下班则照常记早退 5 分钟', () => {
      const out = resolveInstances(night, [{ date: MON, time: '23:45' }, { date: TUE, time: '07:55' }]);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('大夜');
      // 窗口平移到 [1440,1920]：早到 15 分不记迟到，早走 5 分记早退
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['EARLY_LEAVE']);
      expect(only.judgement.findings[0].minutes).toBe(5);
    });

    it('08:0x 单独一天仍判早班（没被平移抢走），迟到早退照常判', () => {
      const out = resolveInstances(night, [{ date: MON, time: '08:13' }, { date: MON, time: '15:00' }]);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('早班');
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['LATE_5', 'EARLY_LEAVE']);
    });

    it('assumeMissingIn 不用平移窗口：20:57 的加班下班卡不会吞掉第二天整天的卡', () => {
      // 8/31 20:57 超出「下班点+2h」余量，且晚于常规班次下班点 → 判 unmatched，不得当成次日上班卡
      const out = resolveInstances(
        [rule('常规班次', '08:00', '18:00', [1, 2, 3, 4, 5, 6, 7], true)],
        [{ date: MON, time: '07:56' }, { date: MON, time: '12:38' }, { date: MON, time: '14:28' }, { date: MON, time: '20:57' },
         { date: TUE, time: '07:57' }, { date: TUE, time: '12:08' }, { date: TUE, time: '14:33' }, { date: TUE, time: '19:10' }]
      );
      const tue = out.filter((o) => o.kind === 'judged' && o.date === TUE);
      expect(tue).toHaveLength(1);
      // 20:57 必须是 unmatched，不能变成 TUE 的实例
      expect(out.filter((o) => o.kind === 'unmatched').map((o) => o.date)).toEqual([MON]);
    });

    it('首卡晚于下班点时不硬判缺上班卡（20:57 是加班下班卡，不是忘打上班卡）', () => {
      const out = resolveInstances([rule('常规班次', '08:00', '18:00', [1, 2, 3, 4, 5, 6, 7], true)],
        [{ date: MON, time: '07:56' }, { date: MON, time: '12:38' }, { date: MON, time: '14:28' }, { date: MON, time: '20:57' }]);
      const late = out.find((o) => o.kind === 'unmatched');
      expect(late).toBeDefined();
      expect(out.filter((o) => o.kind === 'judged' && o.judgement.findings.some((f) => f.type === 'MISSING_IN'))).toEqual([]);
    });

    it('早退 60 分钟内照旧记早退，超过 60 分钟改记缺下班卡（分不清早走还是忘打下班卡）', () => {
      const office = rule('办公室班', '08:30', '18:00', WEEKDAYS);
      // 17:59 走 → 早退 1 分钟，保留早退判语
      expect(judgeOffsets(office, [509, 1079]).findings.map((f) => f.type)).toEqual(['EARLY_LEAVE']);
      // 17:02 走 → 早退 58 分钟，仍在阈值内
      expect(judgeOffsets(office, [484, 1022]).findings.map((f) => f.type)).toEqual(['EARLY_LEAVE']);
      // 14:00 走 → 早退 240 分钟，超阈值 → 缺下班卡
      const big = judgeOffsets(office, [484, 840]);
      expect(big.findings.map((f) => f.type)).toEqual(['MISSING_OUT']);
      expect(big.findings[0].minutes).toBeNull();   // 不给「早退 240 分钟」这种猜出来的数
    });

    it('阈值可按班次覆盖（earlyLeaveAsMissingOutMinutes）', () => {
      const lenient = { ...rule('弹性班', '08:30', '18:00', WEEKDAYS), earlyLeaveAsMissingOutMinutes: 300 };
      expect(judgeOffsets(lenient, [484, 840]).findings.map((f) => f.type)).toEqual(['EARLY_LEAVE']);
    });

    it('judgeOffsets 传 opts.window 时按平移后的窗口算，不传就会算出「迟到 1430 分钟」', () => {
      const c = rule('大夜', '00:00', '08:00');
      const offsets = [1425, 1933];            // 23:45 → 次日 08:13
      expect(judgeOffsets(c, offsets, { window: { start: 1440, end: 1920 } }).findings).toEqual([]);
      // 不传窗口 = 用名义 [0,480]，23:45 会被算成迟到 1430 分钟 —— 这是回归要盯住的坑
      expect(judgeOffsets(c, offsets).findings.map((f) => f.type)).toEqual(['LATE_15']);
      expect(judgeOffsets(c, offsets).findings[0].minutes).toBe(1425);
    });

    it('00:02 上班的大夜班归属日不变（平移不能把同日 00:0x 推到前一天）', () => {
      const out = resolveInstances(night, [{ date: MON, time: '00:02' }, { date: MON, time: '08:00' }]);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.date).toBe(MON);
      expect(only.candidate.name).toBe('大夜');
      expect(only.judgement.findings).toEqual([]);
    });

    it('16:0x 的小夜班上班卡不受影响（23:50 走记早退 10 分钟是正常的）', () => {
      const out = resolveInstances(night, [{ date: MON, time: '16:02' }, { date: MON, time: '23:50' }]);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.candidate.name).toBe('小夜班');
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['EARLY_LEAVE']);
      expect(only.judgement.findings[0].minutes).toBe(10);
    });
  });

  /**
   * 加班余量（overtimeGraceMinutes）：下班点之后多久以内的卡还算这个班的。
   * 缺省 120 会把真实长加班的下班卡丢成未归属卡，实例末卡退化成午休那一刻又误报「缺下班卡」。
   */
  describe('加班余量 overtimeGraceMinutes', () => {
    const day = ['08:00', '12:08', '14:31', '22:05'];   // 08:00-18:00，干到 22:05（超 245 分）
    const punches = day.map((time) => ({ date: MON, time }));

    it('缺省 120：22:05 的下班卡收不进实例，被丢成未归属', () => {
      const { instances, skipped } = buildShiftInstances([rule('常规班次', '08:00', '18:00', WEEKDAYS, true)], punches);
      expect(instances[0].times).toEqual(['08:00', '12:08', '14:31']);
      expect(skipped.map((s) => s.time)).toEqual(['22:05']);
    });

    it('配成 300：22:05 收进实例，判正常（下班点之后不判早退）', () => {
      const out = resolveInstances([rule('常规班次', '08:00', '18:00', WEEKDAYS, true, 300)], punches);
      expect(out).toHaveLength(1);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.judgement.findings).toEqual([]);
      expect(buildShiftInstances([rule('常规班次', '08:00', '18:00', WEEKDAYS, true, 300)], punches).skipped).toEqual([]);
    });

    it('余量只管「同一天内往后收卡」，不会把第二天上班卡也吞进来', () => {
      const out = resolveInstances(
        [rule('常规班次', '08:00', '18:00', WEEKDAYS, true, 300)],
        [...punches, { date: TUE, time: '08:04' }, { date: TUE, time: '18:02' }]
      );
      const tue = out.filter((o) => o.kind === 'judged' && o.date === TUE);
      expect(tue).toHaveLength(1);
    });
  });

  describe('assumeMissingIn（业务单独开启：首卡超容忍记缺上班卡）', () => {
    const office: ShiftCandidate = {
      ...rule('办公室班', '08:30', '18:00'),
      assumeMissingIn: true,
    };
    const night: ShiftCandidate = {
      ...rule('小夜班', '16:00', '24:00'),
      assumeMissingIn: true,
    };

    it('开了开关：12:25 才打第一张卡记缺上班卡，而不是丢成未对班', () => {
      const out = resolveInstances([office], [
        { date: MON, time: '12:25' },
        { date: MON, time: '18:02' },
      ]);
      expect(out).toHaveLength(1);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['MISSING_IN']);
    });

    it('上班卡缺了就不再并排报早退 —— 那是猜出来的数', () => {
      const out = resolveInstances([night], [{ date: MON, time: '23:50' }]);
      const only = out[0];
      if (only.kind !== 'judged') throw new Error('应当判出班次');
      expect(only.judgement.findings.map((f) => f.type)).toEqual(['MISSING_IN']);
    });

    it('没开开关：维持既有口径，判「未对上任何班」', () => {
      const out = resolveInstances([rule('办公室班', '08:30', '18:00')], [{ date: MON, time: '12:25' }]);
      expect(out[0].kind).toBe('unmatched');
    });
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
