/**
 * 考勤判定「人工校对表」——把一个月的逐人逐日判定连同判定依据导出成 Excel。
 *
 * 这份表是给 HR 拿着逐行核对的：每行写清「当天有几张卡、对上了哪个班次、为什么这么判」，
 * 并把系统自己都觉得可疑的行标出来 —— ��能归属的卡、跨零点的边界、单卡、部门没配时段。
 * 月报和异常分析只能告诉 HR「有 70 条异常」，没法回答「凭哪张卡、哪条时段判的」；
 * 人工核对必须能看到中间那一步，否则就只能盲信或重算，两头都不对。
 *
 * 判定一律走 buildShiftPlanner + buildShiftInstances + judgeOffsets —— 与异常分析、月报
 * 同一份实现，本文件不复制任何判定阈值，导出的口径与界面上看到的必然一致。
 */
import ExcelJS from "exceljs";
import { db } from "./db.ts";
import { type DbRow, asString } from "./sqliteUtil.ts";
import { listDeptShiftRules, resolveRulesForDepartment, type DeptShiftRule } from "./shiftRulesDb.ts";
import {
  buildShiftInstances,
  crossesMidnight,
  formatWorkdays,
  judgeOffsets,
  MAX_INSTANCE_SPAN_MINUTES,
  MATCH_TOLERANCE_MINUTES,
  LATE_MINUTES,
  LATE_SERIOUS_MINUTES,
  OVERTIME_GRACE_MINUTES,
  shiftWindow,
  weekdayOf,
  WORKDAY_LABELS,
  type DayJudgement,
  type ShiftInstance,
} from "./shiftMatch.ts";
import { approvedLeaveDayKeys, buildShiftPlanner } from "./attendanceDb.ts";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** 判定类型代码 → 中文。导出用的是界面上的说法，不把 LATE_15 这种内部代码丢给 HR。 */
const FINDING_CN: Record<string, string> = {
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
function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 某月的全部日期。
 * 末月天数走 Date.UTC(y, m, 0) —— 直接拼 "月+1" 的写法会在 12 月越界成 2026-13。
 */
function monthDays(month: string): string[] {
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

interface EmployeeInfo {
  id: string;
  name: string;
  job: string;
  dept: string;
  joinDate: string;
  /** 该员工在库里的最后一张卡；用来判断"下班卡是不是可能打在还没导进来的次日" */
  lastPunchDate: string;
}

interface InstRec {
  inst: ShiftInstance;
  judgement: DayJudgement;
  window: { start: number; end: number };
  inReport: boolean;
  isLeave: boolean;
  single: boolean;
  spanMin: number;
  spanTxt: string;
  cross: boolean;
  late: number | null;
  early: number | null;
  missingTypes: string[];
  shiftLabel: string;
}

/**
 * 某一天判成什么。
 *
 * 纯函数：★ 与判定口径必须能在没有真实数据的情况下被测到。实测库里
 * skipped 恒为 0、未配时段的部门也没有人打卡 —— 也就是这两条分支在
 * 生产数据上永远走不到，不单独拆出来就只能靠"看起来对"。
 *
 * 参数只声明真正读到的字段（judgement / single），不整个要 InstRec ——
 * 越窄越容易在测试里凭空造出来，也越不容易被无关字段的改动带坏。
 */
export function proofDayVerdict(input: {
  noRule: boolean;
  isLeave: boolean;
  times: string[];
  list: { judgement: DayJudgement }[];
  borrowed: string[];
}): string {
  const { noRule, isLeave, times, list, borrowed } = input;
  if (noRule) return "未配置时段";
  if (isLeave) return "请假";
  if (times.length === 0) return "无打卡";
  // 跨零点：本日的卡全被更早那天的班次吃掉了，这天自己没有班
  if (list.length === 0 && borrowed.length > 0) return "班次归前一日";
  if (list.length === 0) return "未对班";
  if (list.every((x) => x.judgement.findings.length === 0)) return "正常";
  return list.flatMap((x) => x.judgement.findings.map((f) => FINDING_CN[f.type] ?? f.type)).join(" + ");
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
  list: { judgement: DayJudgement; single: boolean }[];
  orphan: string[];
  borrowedInMonth: string[];
  borrowedPrevMonth: string[];
  /** 班次下班点跨到次日但末卡没到，且没有更晚的记录 —— 分不清是缺卡还是没导数据 */
  monthEdge: boolean;
}): string {
  const { noRule, isLeave, times, list, orphan, borrowedInMonth, borrowedPrevMonth, monthEdge } = input;
  if (noRule) return "★未配置时段";
  if (isLeave) return "";
  if (proofDayVerdict({ noRule, isLeave, times, list, borrowed: [...borrowedInMonth, ...borrowedPrevMonth] }) === "未对班" && times.length > 0) {
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

interface DayRow {
  emp: EmployeeInfo;
  date: string;
  times: string[];
  list: InstRec[];
  own: string[];
  borrowed: string[];
  /** 归属日在本月的更早一天（跨零点接上班） */
  borrowedInMonth: string[];
  /** 归属日在本月之前（上月末那个班的下班卡） */
  borrowedPrevMonth: string[];
  orphan: string[];
  isLeave: boolean;
  verdict: string;
}

/** 底色：让 HR 扫一眼就知道哪几行有问题 */
const FILL: Record<string, string> = {
  正常: "E7F6EC",
  迟到: "FFF6DA",
  早退: "FDEBDD",
  缺卡: "FCE4E4",
  未对班: "E0E0E0",
  无打卡: "F2F2F2",
  请假: "E8F0F6",
  班次归前一日: "E4EEF7",
  未配置时段: "E8DFF5",
};

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFDDDDDD" } },
  left: { style: "thin", color: { argb: "FFDDDDDD" } },
  bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
  right: { style: "thin", color: { argb: "FFDDDDDD" } },
};

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F3B4C" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 30;
}

function fillOf(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** 判定汇总成一格时用哪个底色：取最严重的那类 */
function verdictFillKey(verdict: string): string {
  if (FILL[verdict]) return verdict;
  if (verdict.includes("迟到")) return "迟到";
  if (verdict.includes("早退")) return "早退";
  if (verdict.includes("缺")) return "缺卡";
  return "未对班";
}

/**
 * 导出某月的考勤判定人工校对表。
 *
 * @param month `YYYY-MM`；非法格式直接抛错，避免拼出一个空表让人以为"这个月没人打卡"。
 */
export async function buildAttendanceProofSheet(month: string): Promise<Buffer> {
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
  // "某人整月没来"这件事就不会出现在表里，而那恰恰是人工校对最该先看见的。
  const empRows = db
    .prepare(
      `SELECT e.id AS id, e.name AS name, e.role AS role, e.joinDate AS joinDate,
              COALESCE(NULLIF(d.name, ''), NULLIF(e.department, ''), '未分配') AS dept
         FROM employees e
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE e.status != '离职'`
    )
    .all() as unknown as DbRow[];

  const employees: EmployeeInfo[] = empRows
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
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const dayRows: DayRow[] = [];
  const instRows: { emp: EmployeeInfo; rec: InstRec }[] = [];
  let ctxCount = 0;
  let leaveInstanceCount = 0;

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

    /** `${卡所在的真实日期}|${时间}` → 吃掉这张卡的班次的归属日 */
    const consumed = new Map<string, string>();
    const byDate = new Map<string, InstRec[]>();
    const recs: InstRec[] = [];

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
      const rec: InstRec = {
        inst,
        judgement,
        window: win,
        inReport,
        isLeave,
        single: inst.offsets.length === 1,
        spanMin: last - inst.offsets[0],
        spanTxt: inst.offsets.length === 1 ? "单卡" : `${hhmm(inst.offsets[0])}→${hhmm(last)}`,
        cross: crossesMidnight(inst.candidate),
        late: judgement.findings.find((f) => f.type.startsWith("LATE"))?.minutes ?? null,
        early: judgement.findings.find((f) => f.type === "EARLY_LEAVE")?.minutes ?? null,
        missingTypes: judgement.findings
          .filter((f) => f.type.startsWith("MISSING"))
          .map((f) => f.type),
        shiftLabel: `${inst.candidate.name} ${inst.candidate.startTime}-${inst.candidate.endTime}`,
      };
      recs.push(rec);
      instRows.push({ emp, rec });
      if (!inReport) {
        ctxCount += 1;
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
      // 入职之前的日子不该出现在校对表里，否则整月无打卡的新人会被当成旷工
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

      dayRows.push({
        emp,
        date,
        times,
        list,
        own,
        borrowed,
        borrowedInMonth,
        borrowedPrevMonth,
        orphan,
        isLeave,
        verdict: proofDayVerdict({ noRule, isLeave, times, list, borrowed }),
      });
    }
  }

  // ═════════ Sheet1 逐人逐日 ═════════
  const wb = new ExcelJS.Workbook();
  const s1 = wb.addWorksheet("逐人逐日");
  s1.columns = [
    { header: "工号", key: "id", width: 12 },
    { header: "姓名", key: "name", width: 10 },
    { header: "职务", key: "job", width: 12 },
    { header: "部门", key: "dept", width: 18 },
    { header: "日期", key: "date", width: 11 },
    { header: "星期", key: "dow", width: 6 },
    { header: "原始记录", key: "raw", width: 26 },
    { header: "卡数", key: "n", width: 5 },
    { header: "班数", key: "sn", width: 5 },
    { header: "对上的班次", key: "shifts", width: 26 },
    { header: "班内时长", key: "spans", width: 22 },
    { header: "迟到(分)", key: "late", width: 8 },
    { header: "早退(分)", key: "early", width: 8 },
    { header: "缺卡类型", key: "miss", width: 18 },
    { header: "判定", key: "verdict", width: 20 },
    { header: "判定依据", key: "why", width: 52 },
    { header: "★需确认", key: "flag", width: 16 },
    { header: "人工校对", key: "manual", width: 12 },
  ];
  styleHeader(s1.getRow(1));
  s1.views = [{ state: "frozen", ySplit: 1 }];

  const needCheck: string[] = [];
  for (const d of dayRows) {
    const noRule = planner(d.emp.id).source === "none";
    /**
     * 记录边界：班次下班点跨到次日（窗口 end > 1440）但末卡没到那儿，
     * 且该员工的记录就停在这一天 —— 分不清是真缺下班卡还是次日那张卡还没导进来。
     * 该员工次日仍有卡，就不是边界，按真缺卡判。
     */
    const monthEdge =
      d.date >= dbMaxDate &&
      d.list.some((x) => x.window.end > 1440 && x.inst.offsets[x.inst.offsets.length - 1] < x.window.end);

    const flag = proofDayFlag({
      noRule,
      isLeave: d.isLeave,
      times: d.times,
      list: d.list,
      orphan: d.orphan,
      borrowedInMonth: d.borrowedInMonth,
      borrowedPrevMonth: d.borrowedPrevMonth,
      monthEdge,
    });

    if (flag.startsWith("★")) {
      const notes = [
        d.orphan.length ? `未归属卡[${d.orphan.join(",")}]` : "",
        monthEdge ? "下班卡可能在次日（记录未覆盖）" : "",
        noRule ? `部门「${d.emp.dept}」未配时段` : "",
      ].filter(Boolean);
      needCheck.push(`${d.emp.name} ${d.date} ${d.verdict}${notes.length ? ` ${notes.join(" ")}` : ""}`);
    }

    const why: string[] = [];
    if (noRule) why.push(`部门「${d.emp.dept}」未配置工作时段，无法判定`);
    else if (d.isLeave) why.push("当天为已批准请假，按产品口径不判考勤异常");
    else {
      for (const x of d.list) {
        const types = x.judgement.findings.map((f) => FINDING_CN[f.type] ?? f.type).join("+") || "正常";
        why.push(`${x.shiftLabel}：${types}${x.single ? "（单卡）" : ""}`);
      }
      if (d.borrowedPrevMonth.length) {
        why.push(`本班归上月：本日的 ${d.borrowedPrevMonth.join("、")} 是上月末那个班次的下班卡`);
      }
      if (d.borrowedInMonth.length) {
        why.push(`本班归前一日：本日的 ${d.borrowedInMonth.join("、")} 是前一个班次的下班卡`);
      }
      if (d.orphan.length) why.push(`未归属卡：${d.orphan.join("、")}（与所有时段的上班时间都相差过大）`);
      if (!why.length) why.push(d.times.length === 0 ? "当天无打卡记录" : "打卡未对上任何班次");
    }

    // 请假日与未配时段的部门都不判异常，迟到/早退/缺卡三列必须跟着判定一起清空。
    // 判定栏写着「请假」而缺卡栏还挂着「缺下班卡」，看表的人只会以为系统判了又不认 ——
    // 而且这三列要能和月报对得上，月报正是跳过请假日累加的。
    const judgedList = d.isLeave || noRule ? [] : d.list;

    const row = s1.addRow({
      id: d.emp.id,
      name: d.emp.name,
      job: d.emp.job,
      dept: d.emp.dept,
      date: d.date,
      dow: WORKDAY_LABELS[weekdayOf(d.date)],
      raw: d.times.length ? d.times.join(" ") : "—",
      n: d.times.length,
      sn: d.list.length,
      shifts: d.list.map((x) => x.shiftLabel).join(" + ") || (d.borrowed.length ? "归前一日" : "—"),
      spans:
        d.list
          .map((x) => (x.single ? "单卡" : `${x.spanTxt} (${(x.spanMin / 60).toFixed(1)}h)`))
          .join(" + ") || "—",
      late: judgedList.map((x) => x.late).filter((v): v is number => v !== null).join("+"),
      early: judgedList.map((x) => x.early).filter((v): v is number => v !== null).join("+"),
      miss: judgedList
        .map((x) => x.missingTypes.map((t) => FINDING_CN[t] ?? t).join("+"))
        .filter(Boolean)
        .join("；"),
      verdict: d.verdict,
      why: why.join("；"),
      flag,
      manual: "",
    });
    row.getCell("verdict").fill = fillOf(`FF${FILL[verdictFillKey(d.verdict)] ?? FILL["未对班"]}`);
    if (flag) {
      row.getCell("flag").fill = fillOf(flag.startsWith("★") ? "FFFFC7CE" : "FFFFE0B2");
    }
    row.eachCell((cell) => {
      cell.border = THIN;
      cell.alignment = { vertical: "middle" };
    });
  }
  s1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s1.columns.length } };

  // ═════════ Sheet2 逐班次实例 ═════════
  const s2 = wb.addWorksheet("逐班次实例");
  s2.columns = [
    { header: "工号", key: "id", width: 12 },
    { header: "姓名", key: "name", width: 10 },
    { header: "部门", key: "dept", width: 18 },
    { header: "归属日", key: "date", width: 11 },
    { header: `是否计入${month}`, key: "in", width: 13 },
    { header: "班次", key: "shift", width: 24 },
    { header: "卡数", key: "n", width: 5 },
    { header: "本班卡时刻", key: "times", width: 22 },
    { header: "班内时长", key: "span", width: 20 },
    { header: "跨日班", key: "cross", width: 7 },
    { header: "迟到(分)", key: "late", width: 8 },
    { header: "早退(分)", key: "early", width: 8 },
    { header: "判定", key: "verdict", width: 20 },
    { header: "判定说明", key: "why", width: 48 },
    { header: "★需确认", key: "flag", width: 14 },
    { header: "人工校对", key: "manual", width: 12 },
  ];
  styleHeader(s2.getRow(1));
  s2.views = [{ state: "frozen", ySplit: 1 }];

  for (const { emp, rec } of instRows) {
    const flag = rec.isLeave
      ? "已批准请假"
      : rec.single
        ? "单卡"
        : rec.cross
          ? "跨零点"
          : "";
    const verdict = rec.isLeave
      ? "请假（不判）"
      : (rec.judgement.findings.map((f) => FINDING_CN[f.type] ?? f.type).join(" + ") || "正常");
    const row = s2.addRow({
      id: emp.id,
      name: emp.name,
      dept: emp.dept,
      date: rec.inst.date,
      in: rec.inReport ? "是" : "否（上下文）",
      shift: rec.shiftLabel,
      n: rec.inst.times.length,
      times: rec.inst.times.join("  "),
      span: rec.single ? "单卡" : `${rec.spanTxt} (${(rec.spanMin / 60).toFixed(1)}h)`,
      cross: rec.cross ? "是" : "",
      late: rec.late ?? "",
      early: rec.early ?? "",
      verdict,
      why: rec.isLeave ? "已批准请假，按产品口径不判考勤异常" : rec.judgement.summary,
      flag,
      manual: "",
    });
    // 班次实例这一层只会出现正常/迟到/早退/缺卡/请假五类；verdictFillKey 的兜底「未对班」
    // 在这里是"没有任何 finding"，也就是正常，不能拿灰色去涂。
    const fillKey = rec.isLeave ? "请假" : rec.judgement.findings.length === 0 ? "正常" : verdictFillKey(verdict);
    row.getCell("verdict").fill = fillOf(`FF${FILL[fillKey]}`);
    if (!rec.inReport) row.getCell("in").fill = fillOf("FFFFF3E0");
    if (flag) row.getCell("flag").fill = fillOf(flag === "已批准请假" ? "FFE8F0F6" : "FFFFE0B2");
    row.eachCell((cell) => {
      cell.border = THIN;
      cell.alignment = { vertical: "middle" };
    });
  }
  s2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s2.columns.length } };

  // ═════════ Sheet3 部门工作时段 ═════════
  // 只导真正被用到的时段规则；没人配过的部门另起一段写清楚，否则
  // "表里没有这个部门"和"这个部门没配"会被读成同一件事。
  const rules = listDeptShiftRules();
  const rulesByDept = new Map<string, DeptShiftRule[]>();
  for (const r of rules) {
    const bucket = rulesByDept.get(r.departmentId) ?? [];
    bucket.push(r);
    rulesByDept.set(r.departmentId, bucket);
  }

  const s3 = wb.addWorksheet("部门工作时段");
  s3.columns = [
    { header: "部门", key: "dept", width: 22 },
    { header: "时段名称", key: "name", width: 14 },
    { header: "上班", key: "s", width: 8 },
    { header: "下班", key: "e", width: 8 },
    { header: "跨日", key: "cross", width: 6 },
    { header: "工作日", key: "wd", width: 10 },
    { header: "首卡超容忍记缺上班卡", key: "ami", width: 19 },
    { header: "加班余量(分)", key: "grace", width: 12 },
    { header: "实际被谁使用", key: "usedBy", width: 34 },
    { header: "说明", key: "why", width: 46 },
  ];
  styleHeader(s3.getRow(1));

  // 谁在用哪条时段：员工部门沿树向上找到的第一个配了时段的部门。
  // 一次查完，不要每个部门重查一次（部门 × 员工 × 规则 是三重放大）。
  const activeWithPunches = db
    .prepare(
      `SELECT e.id AS id, e.name AS name, e.departmentId AS departmentId,
              COALESCE(NULLIF(d.name, ''), NULLIF(e.department, ''), '未分配') AS dept
         FROM employees e
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE e.status != '离职'`
    )
    .all() as unknown as DbRow[];
  const usersByRuleDept = new Map<string, string[]>();
  for (const row of activeWithPunches) {
    const id = asString(row.id);
    if (!punchesOf.has(id)) continue;
    const src = resolveRulesForDepartment(asString(row.departmentId ?? "")).sourceDepartmentId;
    if (!src) continue;
    const label = `${asString(row.name)}（${asString(row.dept)}）`;
    const bucket = usersByRuleDept.get(src) ?? [];
    bucket.push(label);
    usersByRuleDept.set(src, bucket);
  }

  for (const [deptId, deptRules] of rulesByDept) {
    const users = usersByRuleDept.get(deptId) ?? [];
    for (const r of deptRules) {
      const cross = r.endTime <= r.startTime;
      const row = s3.addRow({
        dept: r.departmentName || deptId,
        name: r.name,
        s: r.startTime,
        e: cross ? `${r.endTime}（次日）` : r.endTime,
        cross: cross ? "是" : "",
        wd: formatWorkdays(r.workdays),
        ami: r.assumeMissingIn ? "开" : "关（默认）",
        grace: r.overtimeGraceMinutes,
        usedBy: users.length ? users.join("、") : "本月无人使用",
        why: cross ? "下班点早于上班点，按跨零点处理" : "",
      });
      if (r.overtimeGraceMinutes !== OVERTIME_GRACE_MINUTES) {
        row.getCell("grace").fill = fillOf("FFF9CB9C");
      }
      row.eachCell((cell) => {
        cell.border = THIN;
        cell.alignment = { vertical: "middle" };
      });
    }
  }

  const noRuleDepts = new Map<string, number>();
  for (const emp of employees) {
    if (planner(emp.id).source !== "none") continue;
    if (!punchesOf.has(emp.id)) continue;
    noRuleDepts.set(emp.dept, (noRuleDepts.get(emp.dept) ?? 0) + 1);
  }
  if (noRuleDepts.size > 0) {
    const head = s3.addRow({
      dept: "以下部门本月未配时段，不参与判定",
      name: "",
      s: "",
      e: "",
      cross: "",
      wd: "",
      ami: "",
      grace: "",
      usedBy: "",
      why: "",
    });
    head.font = { bold: true };
    head.eachCell((cell) => {
      cell.border = THIN;
      cell.fill = fillOf(`FF${FILL["未配置时段"]}`);
    });
    for (const [dept, count] of noRuleDepts) {
      const row = s3.addRow({ dept, name: "", s: "", e: "", cross: "", wd: "", ami: "", grace: count, usedBy: "", why: "整条部门链上都没有时段，也未配置排班" });
      row.eachCell((cell) => {
        cell.border = THIN;
        cell.alignment = { vertical: "middle" };
      });
    }
  }

  // ═════════ Sheet4 判定规则 ═════════
  const punchDays = new Set<string>();
  let punchTotal = 0;
  for (const emp of employees) {
    for (const p of punchesOf.get(emp.id) ?? []) {
      if (!reportSet.has(p.date)) continue;
      punchTotal += 1;
      punchDays.add(`${emp.id}__${p.date}`);
    }
  }

  const s4 = wb.addWorksheet("判定规则");
  s4.columns = [
    { header: "项", key: "k", width: 34 },
    { header: "口径 / 取值", key: "v", width: 104 },
  ];
  styleHeader(s4.getRow(1));

  const personDays = dayRows.length;
  const rules4: [string, string][] = [
    ["月份", `${month}（${monthStart} … ${monthEnd}，共 ${days.length} 天）`],
    ["数据来源", `数据库 punch_records 表，只读，未修改任何原始打卡记录`],
    ["取数范围", `${from} … ${to}（两端各多取一天，用于把跨零点的班接上；两端不在本表内，只作上下文）`],
    ["人员", `在职 ${employees.length} 人 × ${days.length} 天；有打卡的「人·日」${punchDays.size} 个，卡 ${punchTotal} 张；本表 ${personDays} 行`],
    ["判定实现", "server/shiftMatch.ts（buildShiftInstances / judgeOffsets），与「异常分析」「月度报表」同一份实现，导出不改判定阈值"],
    ["对班依据", "部门工作时段优先（没配则沿部门树向上继承），其次回退逐日排班；两者都没有则不判定，见 Sheet3 末尾"],
    ["跨零点", `整段打卡按绝对分钟排序串联；单班最长跨 ${MAX_INSTANCE_SPAN_MINUTES / 60} 小时`],
    ["窗口平移", "班次窗口可整体平移 ±1440 分钟：00:00 上班的人在 23:45 打卡，命中的是次日 00:00 那次上班（偏差 15 分钟而不是 1425 分钟）"],
    ["首卡容差", `${MATCH_TOLERANCE_MINUTES} 分钟`],
    ["迟到分档", `超过 ${LATE_SERIOUS_MINUTES} 分钟记「迟到(>15分)」；超过 ${LATE_MINUTES} 分钟记「迟到(>5分)」`],
    ["早退", "末卡早于下班点即记早退"],
    ["单卡天", "只有一张卡时按班次中点猜缺哪张；中点之前记缺下班卡，之后记缺上班卡"],
    ["加班余量", `下班点之后 ${OVERTIME_GRACE_MINUTES} 分钟内的卡还算这个班的；超过就不收，另作未归属卡。可按部门时段单独配置（见 Sheet3）`],
    ["跨月处理", `${monthStart} 之前 / ${monthEnd} 之后的班次实例（${ctxCount} 个）只作上下文把班接上，不计入本月；Sheet2 标为「否（上下文）」并加底色`],
    ["已批准请假", `本月 ${leaveInstanceCount} 个班次落在已批准请假日，按产品口径不判考勤异常（与月报、异常分析一致），本表标为「请假」而不是隐藏`],
    ["", ""],
    ["【★需人工确认】", `共 ${needCheck.length} 行（Sheet1 已用 ★ 标出并加红底）`],
    ["清单", needCheck.length ? needCheck.join("；") : "（无）"],
    ["", ""],
    ["【底色含义】", "浅绿=正常　浅黄=迟到　浅橙=早退　浅红=缺卡　浅灰=未对班/无打卡　浅蓝=请假或班次归前一日　浅紫=未配置时段"],
    ["【★的几种情况】", "★未配置时段=部门没有时段也没排班，不判定；★无法归属=有卡但对不上任何时段；★有未归属卡=存在与上班时间相差过大的卡；★下班卡可能在次日=记录尚未覆盖次日，分不清是缺卡还是没导数据"],
  ];
  for (const [k, v] of rules4) {
    const row = s4.addRow({ k, v });
    row.eachCell((cell) => {
      cell.border = THIN;
      cell.alignment = { vertical: "top", wrapText: true };
    });
    if (k.startsWith("【")) row.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

/** 下载文件名：与参照的《考勤判定-人工校对-202609.xlsx》同名同式，便于 HR 形成习惯 */
export function proofSheetFileName(month: string): string {
  return `考勤判定-人工校对-${month.replace("-", "")}.xlsx`;
}