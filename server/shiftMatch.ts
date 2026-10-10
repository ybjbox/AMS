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

/**
 * 取卡时允许超出下班点多久（分钟）—— 超过就认为这张卡不属��这个班，交给下一班或记未归属。
 *
 * 这条余量是防「把下一班的上班卡吞进本班」用的，写死 120 时遇到真实长加班会误丢：
 * 管段组 08:00-18:00 的人有干到 22:05 的（超 245 分钟），下班卡被丢成未归属卡，
 * 实例末卡退化成午休那一刻，又被判成「缺下班卡」—— 一张卡错两次。
 * 加班多久算正常属业务口径，所以做成可按班次覆盖（ShiftCandidate.overtimeGraceMinutes）。
 */
export const OVERTIME_GRACE_MINUTES = 120;

/**
 * 早退超过多少分钟改记「缺下班卡」而不是「早退」，缺省 60。
 *
 * 分不清「下班早走」与「忘打下班卡」时不该给早退判语 —— 那是在猜。
 * 实测 2026-09 全表 11 条早退：1,1,2,6,34,34,35,35,35,58,240 分钟，
 * 58 → 240 之间有 182 分钟的断层，60 分正好落在断层上：
 * 60 分以内的（17:2x~17:5x 走）保留早退，超过的（文员 14:00 走）记缺下班卡。
 * 可按班次覆盖（ShiftCandidate.earlyLeaveAsMissingOutMinutes）。
 */
export const EARLY_LEAVE_AS_MISSING_OUT_MINUTES = 60;

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
  /**
   * 首卡与上班时间差过容忍时，是记「缺上班卡」还是判「没对上任何班」。
   *
   * 缺省 false = 维持既有口径（宁可不判，也不硬套一个班去算迟到分钟）；
   * 显式 true 用于「当天确实有出勤、只是上班卡没打」的部门，由业务确认后单独开。
   */
  assumeMissingIn?: boolean;
  /**
   * 取卡时允许超出下班点多少分钟（加班余量），缺省 OVERTIME_GRACE_MINUTES(120)。
   * 加班时长是业务口径：把 120 写死时，真实长加班的下班卡会被丢成未归属卡。
   * 例：管段组 08:00-18:00 有人干到 22:05（超 245 分钟），该部门配 300。
   */
  overtimeGraceMinutes?: number;
  /**
   * 早退超过多少分钟改记「缺下班卡」，缺省 EARLY_LEAVE_AS_MISSING_OUT_MINUTES(60)。
   * 分不清「下班早走」与「忘打下班卡」时不该下早退判语 —— 那是在猜。
   * 例：文员 08:30-18:00 的班，14:00 走了，记「缺下班卡」而不是「早退 240 分钟」。
   */
  earlyLeaveAsMissingOutMinutes?: number;
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

/** pickShift 的附带结论，供判定层区分「真早退」与「下班点定不下来的缺卡」 */
export interface PickShiftResult {
  outcome: MatchOutcome;
  /**
   * true = 末卡早于所有候选的下班点且候选不止一条：
   * 分不清是下班早还是忘打下班卡，按业务口径记「缺下班卡」而不是「早退」。
   */
  assumedMissingOut: boolean;
  /**
   * true = 首卡与所有候选上班时间的偏差都超过容忍，但仍挂在最接近的那条班上。
   * 超过容忍说明上班卡没打（或打了但太晚），业务口径（2026-10-09）定的是记「缺上班卡」，
   * 而不是丢成「未对班」—— 那会把真实缺勤藏进覆盖率里。
   * 例：文员 08:30-18:00，她 12:25 才打第一张卡 → 缺上班卡。
   */
  assumedMissingIn: boolean;
  /** 首卡超容忍时挂靠的班次 */
  fallback?: ShiftCandidate;
  /**
   * 命中的班次窗口，相对归属日 00:00 的分钟区间。
   * 与 `shiftWindow(candidate)` 的差别是它可能整体平移 ±1440：
   * 00:00 上班的人 23:45 就来打卡，窗口要摆成 [1440,1920]（次日凌晨）才算得对。
   * 判定层算迟到/早退必须用这个，不能用候选自己的名义窗口。
   */
  window?: { start: number; end: number };
}

/**
 * 用当天打卡时间在一组部门时段里挑一条最合适的班。
 *
 * 口径：
 *  - 只看**首卡**与上班时间的偏差（末卡可能是加班，拿它当锚点会把加班夜判成"没对上班"）；
 *  - 偏差并列时，再比末卡与下班时间的接近程度，再比上班时间更早者，最后比名字，保证结果稳定可复算；
 *  - 首卡偏差超过 MATCH_TOLERANCE_MINUTES 就返回 no-match —— 宁可不判，也不套一个错的班去算迟到分钟。
 */
export function matchShift(candidates: ShiftCandidate[], input: MatchInput): MatchOutcome {
  const times = [...input.times].map((t) => t.slice(0, 5)).sort();
  return pickShift(
    candidates,
    input.date,
    times.length ? toMinutes(times[0]) : null,
    times.length ? toMinutes(times[times.length - 1]) : null
  ).outcome;
}

/**
 * 班次打分与挑选的共同入口。
 *
 * `first` / `last` 是**相对归属日 00:00 的绝对分钟**，可以 >1440（跨零点的班）。
 * buildShiftInstances 传的是换算后的偏移，不能退回 HH:mm 字符串排序：
 * 那样 ["17:01","次日01:01"] 会被排成 ["01:01","17:01"]，首末颠倒
 * （这正是夜班组「17:30 上、次日 01:00 下」的小夜班）。
 */
function pickShift(
  candidates: ShiftCandidate[],
  date: string,
  first: number | null,
  last: number | null
): PickShiftResult {
  const inWorkday = candidates.filter((c) => c.workdays.includes(weekdayOf(date)));
  if (inWorkday.length === 0) return { outcome: { kind: "no-workday", candidates: candidates.length }, assumedMissingOut: false, assumedMissingIn: false };
  if (first === null || last === null) {
    return {
      outcome: { kind: "no-match", closestDelta: null, tolerance: MATCH_TOLERANCE_MINUTES, candidateCount: inWorkday.length },
      assumedMissingOut: false,
      assumedMissingIn: false,
    };
  }

  const scored = inWorkday.map((candidate) => {
    const nominal = shiftWindow(candidate);
    /**
     * 窗口可以在 ±1440 上平移，取首卡最接近的那次「上班」。
     *
     * 缺这一步的话，00:00 上班的人在 23:45 打卡会被算成 |1425−0|=1425 分钟，
     * 永远配不上大夜班 —— 而这恰恰是跨午夜夜班的常态（23:45 打卡、08:0x 下班）。
     * 平移后该例命中 [1440,1920] 这次上班，偏差 15 分钟。
     */
    const placements = [0, 1440, -1440].map((k) => ({ start: nominal.start + k, end: nominal.end + k }));
    const window = placements.reduce((best, p) => (Math.abs(first - p.start) < Math.abs(first - best.start) ? p : best));
    // 末卡可能打在次日（24 点班的凌晨收尾），比下班时间还早说明是次日的那一段
    const lastAdj = last < window.start ? last + 1440 : last;
    return {
      candidate,
      nominal,
      window,
      lastAdj,
      inDelta: Math.abs(first - window.start),
      outDelta: Math.abs(lastAdj - window.end),
    };
  });

  const viable = scored.filter((s) => s.inDelta <= (s.candidate.toleranceMinutes ?? MATCH_TOLERANCE_MINUTES));
  if (viable.length === 0) {
    const closest = scored.reduce((m, s) => (s.inDelta < m.inDelta ? s : m));
    /**
     * 默认维持既有口径：差过容忍就判「没对上任何班」，不硬套一个班。
     * 只有该候选显式开了 assumeMissingIn 才挂靠，且必须同时满足两条：
     *
     *  1) 用**未平移**的名义窗口。「上班卡来晚了」是当天的事，若拿平移到次日的
     *     窗口去收卡，会把第二天整天的卡吞进来（实测：8/31 的 20:57 吞掉 9/1 全部 4 张卡）。
     *  2) 首卡落在该班次窗口**之内或之前**。晚于下班点的卡（20:57、22:05 这类）
     *     明显是加完班的下班卡，硬判「缺上班卡」是凭空造异常 —— 保持 unmatched。
     */
    const lateArrival = first <= closest.nominal.end;
    const allow = closest.candidate.assumeMissingIn === true && lateArrival;
    return {
      outcome: { kind: "no-match", closestDelta: closest.inDelta, tolerance: MATCH_TOLERANCE_MINUTES, candidateCount: inWorkday.length },
      assumedMissingOut: false,
      assumedMissingIn: allow,
      fallback: allow ? closest.candidate : undefined,
      window: allow ? closest.nominal : undefined,
    };
  }

  /**
   * 上班时间相同的多个班次（例 08:00-18:00「常规班次」与 08:00-16:00「连班」）：
   * inDelta 恒等，若只比「离下班点多近」方向是反的 —— 干到 18:00 的人离 16:00 班更远，
   * 于是**永远选到短的那条**，18:0x 的正常下班卡还会被当成对不上班丢掉。
   *
   * 口径（2026-10-09 业务确认）：
   *  - 末卡 ≥ 某条下班点 → 取下班点离末卡最近的那条
   *      干到 18:0x 判常规班次；干到 16:1x 判连班
   *  - 末卡早于所有下班点 → 取下班点最晚的那条，并记「缺下班卡」而不是「早退」
   *      （分不清是下班早还是忘打下班卡，不下早退判语）
   *
   * 只在候选不止一条时生效：单条时段没有歧义，早于下班点照旧判早退。
   */
  const ambiguous = viable.length > 1;
  const allEarly = ambiguous && viable.every((s) => s.lastAdj < s.window.end);

  viable.sort(
    (a, b) =>
      a.inDelta - b.inDelta ||
      (allEarly ? b.window.end - a.window.end : a.outDelta - b.outDelta) ||
      toMinutes(a.candidate.startTime) - toMinutes(b.candidate.startTime) ||
      a.candidate.label.localeCompare(b.candidate.label)
  );

  const best = viable[0];
  return {
    outcome: { kind: "matched", candidate: best.candidate, lateDeltaMinutes: best.inDelta },
    assumedMissingOut: allEarly,
    assumedMissingIn: false,
    window: best.window,
  };
}

/** pickShift 的附带结论，供判定层区分「真早退」与「下班点定不下来的缺卡」 */
export interface PickShiftResult {
  outcome: MatchOutcome;
  /**
   * true = 末卡早于所有候选的下班点且候选不止一条：
   * 分不清是下班早还是忘打下班卡，按业务口径记「缺下班卡」而不是「早退」。
   */
  assumedMissingOut: boolean;
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

/**
 * 与 given 上班时间相同的所有候选里，最晚的下班点（相对归属日 00:00 的分钟）。
 *
 * 只用于 buildShiftInstances 的**取卡窗口**：上班时间相同时首卡分不出是哪条班，
 * 若按其中一条的下班点 +2h 收卡，另一条班次该收的正常下班卡会被整批丢成"未对班"。
 * 一个上班时间都不在候选里时（例如逐日排班只有一条），退回该候选自己的下班点。
 *
 * `atStart` 是命中那次上班的**实际**起点（可能整体平移过 ±1440），
 * 按它比对才能把「平移后仍属于同一条班」的候选聚到一起。
 */
function widestEndForStart(candidates: ShiftCandidate[], anchor: ShiftCandidate, atStart?: number): number {
  const anchorWindow = shiftWindow(anchor);
  const start = atStart ?? anchorWindow.start;
  let widest = anchorWindow.end;
  for (const c of candidates) {
    // 候选的上班点与命中那次上班对齐（同一平移量）后才算「同一上班时间」
    const shiftBy = start - anchorWindow.start;
    const w = shiftWindow(c);
    if (w.start + shiftBy !== start) continue;
    if (w.end + shiftBy > widest) widest = w.end + shiftBy;
  }
  return widest;
}

/** 一个班次实例：归属日 = 首卡那天，卡可能落在次日凌晨 */
export interface ShiftInstance {
  date: string;
  /** 相对归属日 00:00 的分钟数（可 >1440 表示次日） */
  offsets: number[];
  /** 与 offsets 同序的原始 HH:mm，用于展示 */
  times: string[];
  candidate: ShiftCandidate;
  /**
   * 末卡早于该部门所有候选时段的下班点（上班时间相同的多个班次才可能出现）。
   * 分不清是下班早还是忘打下班卡，判定层据此记「缺下班卡」而不是「早退」。
   */
  assumedMissingOut?: boolean;
  /** 首卡与所有候选上班时间的偏差都超过容忍：判定层记「缺上班卡」，不按迟到算 */
  assumedMissingIn?: boolean;
  /**
   * 命中那次「上班」的实际窗口，相对归属日 00:00 的分钟区间。
   * 可能整体平移 ±1440（23:45 打卡、次日 08:0x 下班 → 窗口是 [1440,1920]）。
   * 判定层算迟到/早退、导出算时长都要用它，不能用 shiftWindow(candidate) 的名义窗口。
   */
  window?: { start: number; end: number };
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
    const first = pickShift(candidates, anchor.day, anchor.abs - anchor.dayStart, anchor.abs - anchor.dayStart);
    let anchorCandidate: ShiftCandidate;
    let missingIn = false;
    if (first.outcome.kind === "matched") {
      anchorCandidate = first.outcome.candidate;
    } else if (first.outcome.kind === "no-match" && first.fallback) {
      // 首卡超容忍（上班卡没打，或打得太晚）：挂到最接近的那条时段上记「缺上班卡」，
      // 不丢成「未对班」—— 那会把真实缺勤藏进覆盖率里（业务口径 2026-10-09）。
      anchorCandidate = first.fallback;
      missingIn = true;
    } else {
      // 当天不在任何时段的工作日内：原样交给调用方按「未对班」处理
      skipped.push({ date: anchor.day, time: anchor.time });
      used[i] = true;
      continue;
    }
    const members = [anchor];
    used[i] = true;
    // 取卡窗口用**同一上班时间的最宽那条**：常规班次 08:00-18:00 与连班 08:00-16:00
    // 首卡无法区分，而 16:00 那条的 +2h 加班余量到 18:00 就截止，
    // 会把 18:0x 的正常下班卡整批丢成"未对班"（实测 110 张，超出 1~17 分钟）。
    const anchorWindow = first.window ?? shiftWindow(anchorCandidate);
    // 加班余量按班次可配：管段组有干到 22:05 的，缺省 120 会把那张下班卡丢成未归属
    const grace = anchorCandidate.overtimeGraceMinutes ?? OVERTIME_GRACE_MINUTES;
    const collectEnd = Math.max(
      anchorWindow.end,
      widestEndForStart(candidates, anchorCandidate, anchorWindow.start)
    );
    for (let j = i + 1; j < items.length; j += 1) {
      if (used[j]) continue;
      const span = items[j].abs - anchor.abs;
      if (span > MAX_INSTANCE_SPAN_MINUTES) break;
      // 已经过了这个班的下班点还留出加班余量之外的卡，不再往里收
      if (items[j].abs - anchor.dayStart > collectEnd + grace) continue;
      members.push(items[j]);
      used[j] = true;
    }
    // 收完成员后用**首末卡的真实偏移**重判班次：上班时间相同的多个班次只能靠末卡区分。
    const offsets = members.map((m) => m.abs - anchor.dayStart);
    const second = pickShift(candidates, anchor.day, offsets[0], offsets[offsets.length - 1]);
    const final = second.outcome.kind === "matched" ? second.outcome.candidate : anchorCandidate;
    const finalWindow = second.window ?? anchorWindow;
    // 迟到/早退一律以 finalWindow 为准。少了这一步，23:45 打卡、命中平移后的
    // [1440,1920] 大夜窗口，却拿名义窗口 [0,480] 去减，会算出「迟到 1430 分钟」。
    instances.push({
      date: anchor.day,
      // 相对锚点那天 00:00，才能直接和 shiftWindow 的分钟区间相减
      offsets,
      times: members.map((m) => m.time),
      candidate: final,
      assumedMissingOut: offsets.length >= 2 && second.assumedMissingOut,
      assumedMissingIn: missingIn,
      window: finalWindow,
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
export function judgeOffsets(
  candidate: ShiftCandidate,
  offsets: number[],
  opts?: { assumedMissingOut?: boolean; assumedMissingIn?: boolean; window?: { start: number; end: number } }
): DayJudgement {
  const sorted = [...offsets].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return { findings: [], summary: "当天没有打卡记录" };
  // 有命中那次「上班」的实际窗口就用它（可能平移过 ±1440），否则用名义窗口
  const { start, end } = opts?.window ?? shiftWindow(candidate);
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
  if (opts?.assumedMissingIn) {
    // 首卡与上班时间差过容忍：业务口径（2026-10-09）定的是缺上班卡，不按迟到分钟算。
    // 上班卡缺了就没法判断下班时间是否准点，也不并排报早退 —— 那是猜出来的数。
    findings.push({ type: "MISSING_IN", minutes: null, description: `缺上班卡${note}` });
    return { findings, summary: findings[0]!.description };
  }
  const lateMinutes = sorted[0] - start;
  if (lateMinutes > LATE_SERIOUS_MINUTES) {
    findings.push({ type: "LATE_15", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟${note}` });
  } else if (lateMinutes > LATE_MINUTES) {
    findings.push({ type: "LATE_5", minutes: lateMinutes, description: `迟到 ${lateMinutes} 分钟${note}` });
  }
  if (opts?.assumedMissingOut) {
    // 该部门配了上班时间相同的多个班次，末卡早于所有下班点：
    // 分不清是下班早还是忘打下班卡，业务口径（2026-10-09）定的是记缺下班卡，不下早退判语。
    findings.push({ type: "MISSING_OUT", minutes: null, description: `缺下班卡${note}` });
    return { findings, summary: findings[0]?.description ?? `正常${note}` };
  }
  const earlyMinutes = end - sorted[sorted.length - 1];
  if (earlyMinutes > 0) {
    // 早退幅度大到不像"早走"而像"没打下班卡"时，不下早退判语（那是猜出来的数）
    const flipAt = candidate.earlyLeaveAsMissingOutMinutes ?? EARLY_LEAVE_AS_MISSING_OUT_MINUTES;
    if (earlyMinutes > flipAt) {
      findings.push({ type: "MISSING_OUT", minutes: null, description: `缺下班卡${note}` });
    } else {
      findings.push({ type: "EARLY_LEAVE", minutes: earlyMinutes, description: `早退 ${earlyMinutes} 分钟${note}` });
    }
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
          : `没能对上班次：第一次打卡与最近的上班时间相差 ${match.closestDelta} 分钟，超过允许的 ${match.tolerance} 分钟`,
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
    judgement: judgeOffsets(inst.candidate, inst.offsets, {
      assumedMissingOut: inst.assumedMissingOut,
      assumedMissingIn: inst.assumedMissingIn,
      window: inst.window,
    }),
  }));
  for (const s of skipped) {
    out.push({
      kind: "unmatched",
      date: s.date,
      reason: `没能对上班次：${s.time} 这张卡与所有时段的上班时间都相差过大`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

