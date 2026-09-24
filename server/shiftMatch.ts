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
    .map((candidate) => {
      const window = shiftWindow(candidate);
      // 末卡可能打在次日（24 点班的凌晨收尾），比下班时间还早说明是次日的那一段
      const lastAdj = last < window.start ? last + 1440 : last;
      return {
        candidate,
        inDelta: Math.abs(first - window.start),
        outDelta: Math.abs(lastAdj - window.end),
      };
    })
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

/** 班次是否跨到次日：endTime ≤ startTime（16:00–00:00 的"24 点班"、20:00–04:00 的跨日夜班） */
export function crossesMidnight(c: Pick<ShiftCandidate, "startTime" | "endTime">): boolean {
  return toMinutes(c.endTime) <= toMinutes(c.startTime);
}

/**
 * 班次相对"归属日 00:00"的绝对分钟区间。
 * 跨日班次的下班时间 +1440，这样 16:00–00:00 得到 [960, 1440]、20:00–04:00 得到 [1200, 1680]，
 * 迟到/早退的减法在跨午夜时仍然正确。
 */
export function shiftWindow(c: Pick<ShiftCandidate, "startTime" | "endTime">): { start: number; end: number } {
  const start = toMinutes(c.startTime);
  const rawEnd = toMinutes(c.endTime);
  return { start, end: rawEnd <= start ? rawEnd + 1440 : rawEnd };
}

/** 一个班次实例：归属日 = 首卡那天，卡可能落在次日凌晨 */
export interface ShiftInstance {
  date: string;
  /** 相对归属日 00:00 的分钟数（可 >1440 表示次日） */
  offsets: number[];
  /** 与 offsets 同序的原始 HH:mm，用于展示 */
  times: string[];
  candidate: ShiftCandidate;
}

/** 一个班次实例最长可跨 24 小时（覆盖跨日班 + 适度加班），再往后的卡另起一班 */
export const MAX_INSTANCE_SPAN_MINUTES = 24 * 60;

function dayIndex(date: string, baseDay: number): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : Math.round((t - baseDay) / 86_400_000);
}

/**
 * 把某人按时间排序的打卡切成班次实例 —— 三班倒的关键一步。
 *
 * 按日历日分组会把"16:00–00:00 的人凌晨 00:03 打的下班卡"当成次日的上班卡，
 * 于是同一个人被记成「昨天缺下班卡 + 今天缺上班卡」。改成：
 *  1. 取最早的未归属卡当锚点，按它匹配班次（首卡偏差在容忍内）；
 *  2. 从锚点起 24 小时内、且不早于锚点的卡都归进这个实例；
 *  3. 归属日 = 锚点那天，实例内的最早卡是上班卡、最晚卡是下班卡。
 * 这样凌晨交接的两种情况自动分开：上一班的人已有首卡 → 00:0x 被吸收成末卡；
 * 新班的人没有首卡 → 00:0x 自己就是锚点，归属到当天。
 */
export function buildShiftInstances(
  candidates: ShiftCandidate[],
  punches: { date: string; time: string }[]
): { instances: ShiftInstance[]; skipped: { date: string; time: string }[] } {
  if (punches.length === 0) return { instances: [], skipped: [] };
  // baseDay 取最小日期而不是"第一条"，调用方的传入顺序不参与语义
  const baseDay = Date.parse(`${punches.map((p) => p.date.slice(0, 10)).sort()[0]}T00:00:00Z`);
  const items = punches
    .map((p) => {
      const day = p.date.slice(0, 10);
      const dayStart = dayIndex(day, baseDay) * 1440;
      return { ...p, day, dayStart, abs: dayStart + toMinutes(p.time) };
    })
    .sort((a, b) => a.abs - b.abs || a.day.localeCompare(b.day));
  const used = new Array<boolean>(items.length).fill(false);
  const instances: ShiftInstance[] = [];
  const skipped: { date: string; time: string }[] = [];

  for (let i = 0; i < items.length; i += 1) {
    if (used[i]) continue;
    const anchor = items[i];
    const match = matchShift(candidates, { date: anchor.day, times: [anchor.time] });
    if (match.kind !== "matched") {
      // 锚点对不上任何班：不吞掉后面的卡，原样交给调用方按"未对班"处理
      skipped.push({ date: anchor.day, time: anchor.time });
      used[i] = true;
      continue;
    }
    const window = shiftWindow(match.candidate);
    const members = [anchor];
    used[i] = true;
    for (let j = i + 1; j < items.length; j += 1) {
      if (used[j]) continue;
      const span = items[j].abs - anchor.abs;
      if (span > MAX_INSTANCE_SPAN_MINUTES) break;
      // 已经过了这个班的下班点还留出加班余量（+2h）之外的卡，不再往里收
      if (items[j].abs - anchor.dayStart > window.end + 120) continue;
      members.push(items[j]);
      used[j] = true;
    }
    instances.push({
      date: anchor.day,
      // 相对锚点那天 00:00，才能直接和 shiftWindow 的分钟区间相减
      offsets: members.map((m) => m.abs - anchor.dayStart),
      times: members.map((m) => m.time),
      candidate: match.candidate,
    });
  }
  return { instances, skipped };
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
  void date;
  const list = [...times].map((t) => t.slice(0, 5)).sort();
  if (list.length === 0) return { findings: [], summary: "当天没有打卡记录" };
  return judgeOffsets(candidate, list.map(toMinutes));
}

/**
 * 判定核心：入参是相对**归属日 00:00** 的分钟数，跨午夜的卡会 >1440。
 * 三班倒必须走这一层：16:00–00:00 的人凌晨 00:03 打的下班卡，
 * 用"同一天"的减法会算成早退 -1443 分钟（即不判早退）并把那天判成缺上班卡。
 */
export function judgeOffsets(candidate: ShiftCandidate, offsets: number[]): DayJudgement {
  const sorted = [...offsets].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return { findings: [], summary: "当天没有打卡记录" };
  const { start, end } = shiftWindow(candidate);
  const note = `（对班：${candidate.label}）`;

  if (sorted.length === 1) {
    const midpoint = (start + end) / 2;
    const finding: DayFinding =
      sorted[0] <= midpoint
        ? { type: "MISSING_OUT", minutes: null, description: `缺下班卡${note}` }
        : { type: "MISSING_IN", minutes: null, description: `缺上班卡${note}` };
    return { findings: [finding], summary: finding.description };
  }

  const findings: DayFinding[] = [];
  const lateMinutes = sorted[0] - start;
  if (lateMinutes > LATE_SERIOUS_MINUTES) {
    findings.push({ type: "LATE_15", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟${note}` });
  } else if (lateMinutes > LATE_MINUTES) {
    findings.push({ type: "LATE_5", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟${note}` });
  }
  const earlyMinutes = end - sorted[sorted.length - 1];
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

export type InstanceOutcome =
  | { kind: "judged"; date: string; candidate: ShiftCandidate; judgement: DayJudgement }
  | { kind: "unmatched"; date: string; reason: string };

/**
 * 三班倒口径的整段判定：先把一个人的一串打卡切成班次实例，再逐个判定。
 * 对不上任何班的锚点卡单独报 unmatched，不静默丢弃 —— 与按日分组时的覆盖率口径一致。
 */
export function resolveInstances(
  candidates: ShiftCandidate[],
  punches: { date: string; time: string }[]
): InstanceOutcome[] {
  const { instances, skipped } = buildShiftInstances(candidates, punches);
  const out: InstanceOutcome[] = instances.map((inst) => ({
    kind: "judged" as const,
    date: inst.date,
    candidate: inst.candidate,
    judgement: judgeOffsets(inst.candidate, inst.offsets),
  }));
  for (const s of skipped) {
    out.push({
      kind: "unmatched",
      date: s.date,
      reason: `未对上任何班：${s.time} 的卡与任何时段的上班时间都超过容忍`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
