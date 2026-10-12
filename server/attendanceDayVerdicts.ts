/**
 * 考勤判定的「逐人逐日 / 逐班次」装配 —— 校对表导出与界面显示**共用**的出口。
 *
 * 为什么要有这个文件：判定本身在 `shiftMatch.ts`，但「把一个月的判定凑成一页能读的
 * 东西」还需要取数、接跨零点的上下文、算未归属卡、写判定依据文本。这层逻辑原先长在
 * `attendanceProofSheet.ts` 里，与 ExcelJS 排版混在同一个函数 —— 于是界面上想显示
 * 判定时只有两条路：前端拿 records 自己凑一套（正是文档 §7 的第一号坑，历史上漂过
 * 两次），或者去解析 xlsx。现在两边都读这里，屏幕上那行字与导出表格里那行字**必然**
 * 是同一份代码产出的。
 *
 * 本文件不调用任何判定阈值：迟到分档、首卡容差、加班余量、窗口平移全部来自
 * `shiftMatch.ts`，与「异常分析」「月度报表」同一份实现。
 */
import { db } from "./db.ts";
import { type DbRow, asString } from "./sqliteUtil.ts";
import {
  buildShiftInstances,
  crossesMidnight,
  judgeOffsets,
  shiftWindow,
  weekdayOf,
  WORKDAY_LABELS,
  type ShiftInstance,
} from "./shiftMatch.ts";
import { approvedLeaveDayKeys, buildShiftPlanner } from "./attendanceDb.ts";

/** 月份参数格式；`/export/proof-sheet` 与新端点共用同一份校验，错误文案才可能对得上 */
export const MONTH_RE = /^\d{4}-\d{2}$/;

/** 判定类型代码 → 中文。内部代码（LATE_15）不许直接丢给 HR 看。 */
export const FINDING_CN: Record<string, string> = {
  LATE_15: "迟到(>15分)",
  LATE_5: "迟到(>5分)",
  EARLY_LEAVE: "早退",
  MISSING_IN: "缺上班卡",
  MISSING_OUT: "缺下班卡",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD 加减天数（纯字符串运算，避免本地时区把 00:00 挪走） */
export function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 某月的全部日期。
 * 末月天数走 Date.UTC(y, m, 0) —— 直接拼 "月+1" 的写法会在 12 月越界成 2026-13。
 */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => `${month}-${pad2(i + 1)}`);
}

/** 班次内偏移分钟 → HH:mm（可 >24:00，跨零点的班看得出「次日 01:00」） */
function hhmm(offset: number): string {
  const abs = Math.abs(offset);
  const body = `${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  return offset < 0 ? `-${body}` : body;
}

/** 班次内偏移所属的真实日历日（跨零点的卡落在这里，不是班次归属日） */
function dateOfOffset(anchor: string, offset: number): string {
  return shiftDate(anchor, Math.floor(offset / 1440));
}

interface Punch {
  date: string;
  time: string;
}

export interface VerdictEmployee {
  id: string;
  name: string;
  job: string;
  dept: string;
  joinDate: string;
  /** 该员工在库里的最后一张卡；用来判断"下班卡是不是可能打在还没导进来的次日" */
  lastPunchDate: string;
  /** 本月（含上下午界外一天）内有打卡；Sheet3 用它区分"没人用这条时段"与"没配时段" */
  hasPunches: boolean;
  /** 整条部门链上都没有时段、也没有排班 —— 这个人完全不参与判定 */
  noRule: boolean;
}

export interface VerdictFinding {
  type: string;
  /** 界面直接读 label，不再自己映射一遍 */
  label: string;
  minutes: number | null;
}

/** 一个班次实例（三班倒的一天可能有多个；跨零点时归属日与卡所在日不是同一天） */
export interface InstanceVerdictRow {
  employeeId: string;
  employeeName: string;
  department: string;
  /** 班次归属日（不是打卡所在日历日） */
  date: string;
  weekday: string;
  /** 归属日是否落在本月；false = 只是把跨零点的班接上的上下文 */
  inReport: boolean;
  shiftLabel: string;
  times: string[];
  single: boolean;
  /** 本班首末卡跨度（分钟）与给人看的写法 */
  spanMin: number;
  spanTxt: string;
  /** 末卡相对归属日 00:00 的偏移分钟（跨零点时 >1440），记录边界判断用 */
  lastOffset: number;
  cross: boolean;
  isLeave: boolean;
  findings: VerdictFinding[];
  verdict: string;
  why: string;
  flag: string;
  late: number | null;
  early: number | null;
  window: { start: number; end: number };
}

export interface DayVerdictRow {
  employeeId: string;
  employeeName: string;
  job: string;
  department: string;
  date: string;
  weekday: string;
  /** 当天全部原始卡点（含未归属的那些） */
  times: string[];
  /** 当天对上号的班次（已排除只作上下文的前一日/次月班） */
  instances: InstanceVerdictRow[];
  own: string[];
  borrowed: string[];
  borrowedInMonth: string[];
  borrowedPrevMonth: string[];
  /** 与所有候选时段的上班时间都相差过大、没被任何班收走的卡 */
  orphan: string[];
  isLeave: boolean;
  noRule: boolean;
  /** 下班点跨到次日但末卡没到那儿，且该员工的记录就停在这一天 */
  monthEdge: boolean;
  verdict: string;
  /** 为什么这么判：与导出「判定依据」列逐字相同 */
  why: string;
  /** 与导出「★需确认」列逐字相同；★ 开头表示系统自己都觉得该有人看一眼 */
  flag: string;
  shiftSummary: string;
  spanSummary: string;
  /**
   * 迟到/早退/缺卡三格的文本。请假日与未配时段**必须为空**：判定栏写着「请假」
   * 而缺卡栏还挂着「缺下班卡」，看的人只会以为系统判了又不认。
   */
  lateText: string;
  earlyText: string;
  missingText: string;
}

export interface MonthVerdicts {
  month: string;
  monthStart: string;
  monthEnd: string;
  /** 取数区间：两端各多取一天，用来把跨零点的班接上 */
  from: string;
  to: string;
  /** 本月的日历天数（与 `days.length` 不同：入职前的日子不进 `days`） */
  dayCount: number;
  employees: VerdictEmployee[];
  /** 有打卡的员工 id（Sheet3 判断"这条时段本月有没有人用"） */
  punchedEmployeeIds: Set<string>;
  days: DayVerdictRow[];
  /** 含上下文实例（inReport = false），Sheet2 用 */
  instances: InstanceVerdictRow[];
  contextInstanceCount: number;
  leaveInstanceCount: number;
  /** 本月内的「人·日」与卡数，Sheet4 的口径说明用 */
  punchedPersonDays: number;
  punchTotal: number;
  /** 带 ★ 的行家注，Sheet4 的「清单」 */
  needCheckNotes: string[];
}

/**
 * 某一天判成什么。
 *
 * 纯函数：★ 与判定口径必须能在没有真实数据的情况下被测到。实测库里
 * skipped 恒为 0、未配时段的部门也没有人打卡 —— 也就是这两条分支在
 * 生产数据上永远走不到，不单独拆出来就只能靠"看起来对"。
 *
 * 参数只声明真正读到的字段（findings），不整个要 InstanceVerdictRow ——
 * 越窄越容易在测试里凭空造出来，也越不容易被无关字段的改动带坏。
 */
export function proofDayVerdict(input: {
  noRule: boolean;
  isLeave: boolean;
  times: string[];
  list: { findings: VerdictFinding[] }[];
  borrowed: string[];
}): string {
  const { noRule, isLeave, times, list, borrowed } = input;
  if (noRule) return "未配置时段";
  if (isLeave) return "请假";
  if (times.length === 0) return "无打卡";
  // 跨零点：本日的卡全被更早那天的班次吃掉了，这天自己没有班
  if (list.length === 0 && borrowed.length > 0) return "班次归前一日";
  if (list.length === 0) return "未对班";
  if (list.every((x) => x.findings.length === 0)) return "正常";
  return list.flatMap((x) => x.findings.map((f) => f.label)).join(" + ");
}

/**
 * 这一行要不要标 ★（或退一档的普通提示）。
 *
 * 顺序即优先级：越靠前越严重。没配时段 > 对不上班 > 有未归属卡 > 记录边界。
 * 请假日不标 —— 那是人已经批过的事，再标出来只会让校对的人白忙一场。
 */
export function proofDayFlag(input: {
  noRule: boolean;
  isLeave: boolean;
  times: string[];
  list: { findings: VerdictFinding[]; single: boolean }[];
  orphan: string[];
  borrowedInMonth: string[];
  borrowedPrevMonth: string[];
  /** 班次下班点跨到次日但末卡没到，且没有更晚的记录 —— 分不清是缺卡还是没导数据 */
  monthEdge: boolean;
}): string {
  const { noRule, isLeave, times, list, orphan, borrowedInMonth, borrowedPrevMonth, monthEdge } = input;
  if (noRule) return "★未配置时段";
  if (isLeave) return "";
  if (
    proofDayVerdict({ noRule, isLeave, times, list, borrowed: [...borrowedInMonth, ...borrowedPrevMonth] }) ===
      "未对班" && times.length > 0
  ) {
    return "★无法归属";
  }
  if (orphan.length) return "★有未归属卡";
  if (monthEdge) return "★下班卡可能在次日";
  if (borrowedPrevMonth.length) return "班次归上月";
  if (list.some((x) => x.single)) return "单卡";
  if (borrowedInMonth.length) return "班次归前一日";
  if (times.length === 0) return "无考勤";
  return "";
}

/** 装配某月的判定。非法月份抛错，避免上层拼出一个空表让人以为"这个月没人打卡"。 */
export function buildMonthDayVerdicts(month: string): MonthVerdicts {
  if (!MONTH_RE.test(month)) throw new Error("月份格式应为 YYYY-MM");

  const days = monthDays(month);
  const monthStart = days[0];
  const monthEnd = days[days.length - 1];
  const reportSet = new Set(days);
  const leaveDays = approvedLeaveDayKeys();
  const planner = buildShiftPlanner();

  // 两端各多取一天：跨零点的班，月末那班的下班卡可能打在次月 1 日，
  // 不多取一天的话月末永远判成"缺下班卡"，而那只是记录边界。
  const from = shiftDate(monthStart, -1);
  const to = shiftDate(monthEnd, 1);

  const punchesOf = new Map<string, Punch[]>();
  const punchName = new Map<string, string>();
  let dbMaxDate = "";
  const punchRows = db
    .prepare(
      `SELECT employeeId, employeeName, date, time FROM punch_records
        WHERE date >= ? AND date <= ? ORDER BY employeeId, date, time`
    )
    .all(from, to) as unknown as DbRow[];
  for (const r of punchRows) {
    const id = asString(r.employeeId);
    const date = asString(r.date);
    if (date > dbMaxDate) dbMaxDate = date;
    const list = punchesOf.get(id) ?? [];
    list.push({ date, time: asString(r.time).slice(0, 5) });
    punchesOf.set(id, list);
    punchName.set(id, asString(r.employeeName));
  }

  // 员工档案。整月一张卡都没有的人**也要**列出来 —— 只列有打卡的人，
  // "某人整月没来"这件事就不会出现在结果里，而那恰恰是最该先看见的。
  const empRows = db
    .prepare(
      `SELECT e.id AS id, e.name AS name, e.role AS role, e.joinDate AS joinDate,
              COALESCE(NULLIF(d.name, ''), NULLIF(e.department, ''), '未分配') AS dept
         FROM employees e
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE e.status != '离职'`
    )
    .all() as unknown as DbRow[];

  const employees: VerdictEmployee[] = empRows
    .map((r) => {
      const id = asString(r.id);
      const punches = punchesOf.get(id) ?? [];
      return {
        id,
        name: punchName.get(id) || asString(r.name),
        job: asString(r.role),
        dept: asString(r.dept),
        joinDate: asString(r.joinDate),
        lastPunchDate: punches.length ? punches[punches.length - 1].date : "",
        hasPunches: punches.length > 0,
        noRule: planner(id).source === "none",
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const dayRows: DayVerdictRow[] = [];
  const instRows: InstanceVerdictRow[] = [];
  let contextInstanceCount = 0;
  let leaveInstanceCount = 0;
  /** 有打卡的「人·日」，去重后才是月报口径的那个数字（一天两班只算一天） */
  const punchedPersonDays = new Set<string>();
  let punchTotal = 0;

  for (const emp of employees) {
    const punches = punchesOf.get(emp.id) ?? [];
    const plan = planner(emp.id);
    const noRule = plan.source === "none";

    // 没配时段时所有卡都算未归属；buildShiftInstances 本身也会把"当天不在任何时段工作日"
    // 的卡丢进 skipped，两条路都归到 orphan，口径一致。
    const built =
      plan.candidates.length > 0
        ? buildShiftInstances(plan.candidates, punches)
        : { instances: [] as ShiftInstance[], skipped: punches.map((p) => ({ ...p })) };

    for (const p of punches) {
      if (!reportSet.has(p.date)) continue;
      punchTotal += 1;
      punchedPersonDays.add(`${emp.id}__${p.date}`);
    }

    /** `${卡所在的真实日期}|${时间}` → 吃掉这张卡的班次的归属日 */
    const consumed = new Map<string, string>();
    const byDate = new Map<string, InstanceVerdictRow[]>();

    for (const inst of built.instances) {
      const judgement = judgeOffsets(inst.candidate, inst.offsets, {
        assumedMissingOut: inst.assumedMissingOut,
        assumedMissingIn: inst.assumedMissingIn,
        window: inst.window,
      });
      const win = inst.window ?? shiftWindow(inst.candidate);
      inst.offsets.forEach((off, i) => {
        consumed.set(`${dateOfOffset(inst.date, off)}|${inst.times[i]}`, inst.date);
      });

      const inReport = reportSet.has(inst.date);
      const isLeave = leaveDays.has(`${emp.id}__${inst.date}`);
      if (isLeave) leaveInstanceCount += 1;
      const last = inst.offsets[inst.offsets.length - 1];
      const single = inst.offsets.length === 1;
      const cross = crossesMidnight(inst.candidate);
      const findings: VerdictFinding[] = judgement.findings.map((f) => ({
        type: f.type,
        label: FINDING_CN[f.type] ?? f.type,
        minutes: f.minutes,
      }));
      // 实例这一层的判定与标记：原先在 Sheet2 的渲染循环里就地算，挪到这里，
      // 界面与导出才可能读到同一串字。
      const verdict = isLeave ? "请假（不判）" : findings.map((f) => f.label).join(" + ") || "正常";
      const rec: InstanceVerdictRow = {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.dept,
        date: inst.date,
        weekday: WORKDAY_LABELS[weekdayOf(inst.date)],
        inReport,
        shiftLabel: `${inst.candidate.name} ${inst.candidate.startTime}-${inst.candidate.endTime}`,
        times: inst.times,
        single,
        spanMin: last - inst.offsets[0],
        /** 末卡的绝对分钟（可 >1440）：算「下班卡可能在次日」要看它有没有到窗口末端 */
        lastOffset: last,
        spanTxt: single ? "单卡" : `${hhmm(inst.offsets[0])}→${hhmm(last)}`,
        cross,
        isLeave,
        findings,
        verdict,
        why: isLeave ? "已批准请假，按产品口径不判考勤异常" : judgement.summary,
        flag: isLeave ? "已批准请假" : single ? "单卡" : cross ? "跨零点" : "",
        late: judgement.findings.find((f) => f.type.startsWith("LATE"))?.minutes ?? null,
        early: judgement.findings.find((f) => f.type === "EARLY_LEAVE")?.minutes ?? null,
        window: win,
      };
      instRows.push(rec);
      if (!inReport) {
        contextInstanceCount += 1;
        continue;
      }
      const bucket = byDate.get(inst.date) ?? [];
      bucket.push(rec);
      byDate.set(inst.date, bucket);
    }

    const timesByDate = new Map<string, string[]>();
    for (const p of punches) {
      const list = timesByDate.get(p.date) ?? [];
      list.push(p.time);
      timesByDate.set(p.date, list);
    }
    const orphanByDate = new Map<string, string[]>();
    for (const s of built.skipped) {
      const list = orphanByDate.get(s.date) ?? [];
      list.push(s.time);
      orphanByDate.set(s.date, list);
    }

    for (const date of days) {
      // 入职之前的日子不该出现在结果里，否则整月无打卡的新人会被当成旷工
      if (emp.joinDate && date < emp.joinDate) continue;
      const times = (timesByDate.get(date) ?? []).slice().sort();
      const list = byDate.get(date) ?? [];
      const orphan = (orphanByDate.get(date) ?? []).slice().sort();
      const own: string[] = [];
      const borrowedInMonth: string[] = [];
      const borrowedPrevMonth: string[] = [];
      for (const t of times) {
        const owner = consumed.get(`${date}|${t}`);
        if (owner === undefined) continue; // 未归属：走 skipped / orphan 那条路
        if (owner === date) own.push(t);
        else if (reportSet.has(owner)) borrowedInMonth.push(t);
        else borrowedPrevMonth.push(t);
      }
      const borrowed = [...borrowedInMonth, ...borrowedPrevMonth];
      const isLeave = leaveDays.has(`${emp.id}__${date}`);

      const monthEdge = date >= dbMaxDate && list.some((x) => x.window.end > 1440 && x.lastOffset < x.window.end);

      const verdict = proofDayVerdict({ noRule, isLeave, times, list, borrowed });
      const flag = proofDayFlag({
        noRule,
        isLeave,
        times,
        list,
        orphan,
        borrowedInMonth,
        borrowedPrevMonth,
        monthEdge,
      });

      const why: string[] = [];
      if (noRule) why.push(`部门「${emp.dept}」未配置工作时段，无法判定`);
      else if (isLeave) why.push("当天为已批准请假，按产品口径不判考勤异常");
      else {
        for (const x of list) {
          const types = x.findings.map((f) => f.label).join("+") || "正常";
          why.push(`${x.shiftLabel}：${types}${x.single ? "（单卡）" : ""}`);
        }
        if (borrowedPrevMonth.length) {
          why.push(`本班归上月：本日的 ${borrowedPrevMonth.join("、")} 是上月末那个班次的下班卡`);
        }
        if (borrowedInMonth.length) {
          why.push(`本班归前一日：本日的 ${borrowedInMonth.join("、")} 是前一个班次的下班卡`);
        }
        if (orphan.length) why.push(`未归属卡：${orphan.join("、")}（与所有时段的上班时间都相差过大）`);
        if (!why.length) why.push(times.length === 0 ? "当天无打卡记录" : "打卡未对上任何班次");
      }

      // 请假日与未配时段都不判异常，迟到/早退/缺卡三格必须跟着判定一起清空 ——
      // 而且这三格要能和月报对得上，月报正是跳过请假日累加的。
      const judgedList = isLeave || noRule ? [] : list;

      dayRows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        job: emp.job,
        department: emp.dept,
        date,
        weekday: WORKDAY_LABELS[weekdayOf(date)],
        times,
        instances: list,
        own,
        borrowed,
        borrowedInMonth,
        borrowedPrevMonth,
        orphan,
        isLeave,
        noRule,
        monthEdge,
        verdict,
        why: why.join("；"),
        flag,
        shiftSummary: list.map((x) => x.shiftLabel).join(" + ") || (borrowed.length ? "归前一日" : "—"),
        spanSummary: list.map((x) => (x.single ? "单卡" : `${x.spanTxt} (${(x.spanMin / 60).toFixed(1)}h)`)).join(" + ") || "—",
        lateText: judgedList.map((x) => x.late).filter((v): v is number => v !== null).join("+"),
        earlyText: judgedList.map((x) => x.early).filter((v): v is number => v !== null).join("+"),
        missingText: judgedList
          .map((x) => x.findings.filter((f) => f.type.startsWith("MISSING")).map((f) => f.label).join("+"))
          .filter(Boolean)
          .join("；"),
      });
    }
  }

  const needCheckNotes: string[] = [];
  for (const d of dayRows) {
    if (!d.flag.startsWith("★")) continue;
    const notes = [
      d.orphan.length ? `未归属卡[${d.orphan.join(",")}]` : "",
      d.monthEdge ? "下班卡可能在次日（记录未覆盖）" : "",
      d.noRule ? `部门「${d.department}」未配时段` : "",
    ].filter(Boolean);
    needCheckNotes.push(`${d.employeeName} ${d.date} ${d.verdict}${notes.length ? ` ${notes.join(" ")}` : ""}`);
  }

  return {
    month,
    monthStart,
    monthEnd,
    from,
    to,
    dayCount: days.length,
    employees,
    punchedEmployeeIds: new Set(punchesOf.keys()),
    days: dayRows,
    instances: instRows,
    contextInstanceCount,
    leaveInstanceCount,
    punchedPersonDays: punchedPersonDays.size,
    punchTotal,
    needCheckNotes,
  };
}
