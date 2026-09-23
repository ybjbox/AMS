/**
 * 按打卡时间自动对班（N1 判定层内核）。
 *
 * 用户给的是「各部门上班时间段」，不是逐日排班表，所以异常判定不能再依赖
 * HR 事先给每个人排好班：拿当天的打卡时间去匹配部门时段，谁对上下班就算谁的班。
 *
 * 这一层刻意写成**纯函数**（不碰数据库）：
 * 打卡→判定 的口径只有这一份实现，异常分析与月报都必须经过它。
 * 之前月报与 analyzeAnomalies 各写了一遍规则，两处阈值漂移过一次（第 4 批修的就是这类问题），
 * 不再重复那个错误。
 */

/** 上班卡与规则上班时间的最大容忍偏差（分钟）。超过就判"没对上任何班"，而不是硬套一个班 */
export const MATCH_TOLERANCE_MINUTES = 180;

/** 迟到判定阈值（分钟）：>15 记 LATE_15，>5 记 LATE_5，与既有异常类型完全一致 */
export const LATE_SERIOUS_MINUTES = 15;
export const LATE_MINUTES = 5;

export interface ShiftCandidate {
  /** 展示与溯源用标签，如「研发部 · 正常班 09:00-18:00」 */
  label: string;
  /** 生效规则的来源部门名（继承父部门时指向父部门） */
  sourceDepartment: string;
  name: string;
  startTime: string;
  endTime: string;
  /** 1=周一 … 7=周日 */
  workdays: number[];
  /**
   * 上班卡可接受的最大偏差（分钟），缺省 = MATCH_TOLERANCE_MINUTES。
   * 逐日排班来的候选传 Infinity：那是 HR 明确指定"这个人这天就上这个班"，
   * 15:00 才打第一卡应判「缺上班卡 + 早退」，而不是"对不上班所以不判"。
   */
  toleranceMinutes?: number;
}

/** 逐日排班（既有 schedules + shifts 口径）转成的候选，用于部门没配时段时的回退 */
export function candidateFromShift(shift: { name: string; startTime: string; endTime: string }): ShiftCandidate {
  return {
    label: `${shift.name}（排班）`,
    sourceDepartment: '',
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    // 排班字典没有工作日概念，沿用既有行为：哪天有卡哪天算上班
    workdays: [1, 2, 3, 4, 5, 6, 7],
    toleranceMinutes: Number.POSITIVE_INFINITY,
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** YYYY-MM-DD → 1..7（周一为 1）。按本地日历日解析，不引入 UTC 偏移。 */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return 1;
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 ? 7 : dow;
}

export const WORKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

export function formatWorkdays(workdays: number[]): string {
  const sorted = [...new Set(workdays)].filter((w) => w >= 1 && w <= 7).sort((a, b) => a - b);
  if (sorted.length === 7) return "每天";
  return sorted.map((w) => WORKDAY_LABELS[w]).join("、") || "未设置";
}

export interface MatchInput {
  date: string;
  /** 当天打卡时间（HH:mm 或 HH:mm:ss 都行，内部统一截到分钟） */
  times: string[];
}

export type MatchOutcome =
  | { kind: "matched"; candidate: ShiftCandidate; lateDeltaMinutes: number }
  | { kind: "no-workday"; candidates: number }
  | { kind: "no-match"; closestDelta: number | null; tolerance: number; candidateCount: number };

/**
 * 用当天打卡时间在一组部门时段里挑一条最合适的班。
 *
 * 口径：
 *  - 只看**首卡**与上班时间的偏差（末卡可能是加班，拿它当锚点会把加班夜判成"没对上班"）；
 *  - 偏差并列时，再比末卡与下班时间的接近程度，再比上班时间更早者，最后比名字，保证结果稳定可复算；
 *  - 首卡偏差超过 MATCH_TOLERANCE_MINUTES 就返回 no-match —— 宁可不判，也不套一个错的班去算迟到分钟。
 */
export function matchShift(candidates: ShiftCandidate[], input: MatchInput): MatchOutcome {
  const inWorkday = candidates.filter((c) => c.workdays.includes(weekdayOf(input.date)));
  if (inWorkday.length === 0) return { kind: "no-workday", candidates: candidates.length };
  const times = [...input.times].map((t) => t.slice(0, 5)).sort();
  if (times.length === 0)
    return { kind: "no-match", closestDelta: null, tolerance: MATCH_TOLERANCE_MINUTES, candidateCount: inWorkday.length };

  const first = toMinutes(times[0]);
  const last = toMinutes(times[times.length - 1]);
  const scored = inWorkday
    .map((candidate) => ({
      candidate,
      inDelta: Math.abs(first - toMinutes(candidate.startTime)),
      outDelta: Math.abs(last - toMinutes(candidate.endTime)),
    }))
    .sort(
      (a, b) =>
        a.inDelta - b.inDelta ||
        a.outDelta - b.outDelta ||
        toMinutes(a.candidate.startTime) - toMinutes(b.candidate.startTime) ||
        a.candidate.label.localeCompare(b.candidate.label)
    );

  const best = scored[0];
  const tolerance = best.candidate.toleranceMinutes ?? MATCH_TOLERANCE_MINUTES;
  if (best.inDelta > tolerance) {
    return { kind: "no-match", closestDelta: best.inDelta, tolerance, candidateCount: inWorkday.length };
  }
  return { kind: "matched", candidate: best.candidate, lateDeltaMinutes: best.inDelta };
}

export interface DayFinding {
  /** 异常类型代码，与既有 anomalies.type 同集：LATE_15 / LATE_5 / EARLY_LEAVE / MISSING_IN / MISSING_OUT */
  type: string;
  minutes: number | null;
  description: string;
}

export interface DayJudgement {
  /** 一天可能有迟到 + 早退两条（与历史行为一致，不收窄） */
  findings: DayFinding[];
  /** 给人看的一句话（异常表、匹配自检、覆盖率说明共用） */
  summary: string;
}

/**
 * 给定已经对上的班与当天打卡，产出判定结果。
 * 判定式与历史一致：迟到 >15 / >5 分档、早退 >0 分、只有一张卡按中点判缺哪张。
 * description 里带上对上的班，让 HR 能看懂这条异常是拿哪条时段算出来的。
 */
export function judgeDay(candidate: ShiftCandidate, date: string, times: string[]): DayJudgement {
  const list = [...times].map((t) => t.slice(0, 5)).sort();
  const start = toMinutes(candidate.startTime);
  const end = toMinutes(candidate.endTime);
  const note = `（对班：${candidate.label}）`;
  void date;
  if (list.length === 0) return { findings: [], summary: "当天没有打卡记录" };

  if (list.length === 1) {
    const t = toMinutes(list[0]);
    const midpoint = (start + end) / 2;
    const finding: DayFinding =
      t <= midpoint
        ? { type: "MISSING_OUT", minutes: null, description: `缺下班卡${note}` }
        : { type: "MISSING_IN", minutes: null, description: `缺上班卡${note}` };
    return { findings: [finding], summary: finding.description };
  }

  const findings: DayFinding[] = [];
  const lateMinutes = toMinutes(list[0]) - start;
  if (lateMinutes > LATE_SERIOUS_MINUTES) {
    findings.push({ type: "LATE_15", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟${note}` });
  } else if (lateMinutes > LATE_MINUTES) {
    findings.push({ type: "LATE_5", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟${note}` });
  }
  const earlyMinutes = end - toMinutes(list[list.length - 1]);
  if (earlyMinutes > 0) {
    findings.push({ type: "EARLY_LEAVE", minutes: earlyMinutes, description: `早退 ${earlyMinutes} 分钟${note}` });
  }
  return { findings, summary: findings[0]?.description ?? `正常${note}` };
}

export type DayOutcome =
  | { kind: "judged"; candidate: ShiftCandidate; lateDeltaMinutes: number; judgement: DayJudgement }
  | { kind: "no-workday"; candidateCount: number; reason: string }
  | { kind: "no-match"; reason: string };

/**
 * 一整套判定：解析当天生效的候选班 → 匹配 → 判异常；对不上就返回原因而不是硬判。
 * 异常分析与月报都走这里，避免两处各写一遍规则（那是第 4 批修过的口径漂移源头）。
 */
export function resolveDay(candidates: ShiftCandidate[], input: MatchInput): DayOutcome {
  const match = matchShift(candidates, input);
  if (match.kind === "no-workday") {
    return {
      kind: "no-workday",
      candidateCount: match.candidates,
      reason: `${input.date} 不在已配置时段的工作日内（${match.candidates} 条时段），不判定`,
    };
  }
  if (match.kind === "no-match") {
    return {
      kind: "no-match",
      reason:
        match.closestDelta === null
          ? "当天没有打卡记录"
          : `未对上任何班：首卡与最近的上班时间相差 ${match.closestDelta} 分钟，超过容忍 ${match.tolerance} 分钟`,
    };
  }
  return {
    kind: "judged",
    candidate: match.candidate,
    lateDeltaMinutes: match.lateDeltaMinutes,
    judgement: judgeDay(match.candidate, input.date, input.times),
  };
}
