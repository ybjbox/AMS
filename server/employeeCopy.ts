/**
 * 员工端文案层：把判定引擎的原句翻译成一线员工能读懂的话。
 *
 * 为什么必须在服务端做：`/my` 的目标是「只看结果句，不出现引擎词」，但判定行里的
 * `why` 是给校对表/HR 用的（「小夜班 16:00-24:00：缺下班卡（单卡）；本班归上月…」）。
 * 只要前端直接渲染，任何 UI 文案都救不回来。这里与判定装配同一份数据，产出
 * verdict / why / 异常描述三样员工版文本，HR 侧继续用原句。
 *
 * 禁用词（员工端）：未判定、对班、班次、实例、覆盖、单卡、归上月。
 * 这些词是内部口径，不是员工能对应上的概念；测试会逐个断言。
 */
import type { DayVerdictRow, InstanceVerdictRow, VerdictFinding } from "./attendanceDayVerdicts.ts";

export interface EmployeeAnomaly {
  id: string;
  date: string;
  type: string;
  description: string;
  minutes: number | null;
  /**
   * 能确定原卡时刻时给异议表单预填（迟到→上班卡，早退→下班卡）。
   * 缺卡没有"原时刻"可依，留空，不拿班次时间冒充员工实际打卡。
   */
  suggestedTime: string;
}

export interface EmployeeDayCopy {
  verdict: string;
  why: string;
  flag: string;
}

const LATE = "LATE";
const EARLY = "EARLY_LEAVE";
const MISSING = "MISSING";

const isLate = (t: string) => t.startsWith(LATE);
const isMissing = (t: string) => t.startsWith(MISSING);

function shiftRange(inst: InstanceVerdictRow): string {
  const idx = inst.shiftLabel.lastIndexOf(" ");
  return idx >= 0 ? inst.shiftLabel.slice(idx + 1) : "";
}

function firstTime(inst: InstanceVerdictRow): string {
  return inst.times[0] ?? "";
}

function lastTime(inst: InstanceVerdictRow): string {
  return inst.times[inst.times.length - 1] ?? "";
}

/** 一个异常点的人话描述（异常卡片上的那一行） */
function findingDescription(f: VerdictFinding, inst: InstanceVerdictRow): string {
  const range = shiftRange(inst);
  const suffix = range ? ` · 按 ${range} 的班` : "";
  if (isLate(f.type)) return `迟到${f.minutes ? ` ${f.minutes} 分钟` : ""}${suffix}`;
  if (f.type === EARLY) return `早退${f.minutes ? ` ${f.minutes} 分钟` : ""}${suffix}`;
  if (f.type === "MISSING_IN") return `缺上班卡${suffix}`;
  if (f.type === "MISSING_OUT") return `缺下班卡${suffix}`;
  return `考勤异常${suffix}`;
}

/** 一个班次实例的人话依据（展开后显示） */
function instanceWhy(inst: InstanceVerdictRow): string {
  const range = shiftRange(inst);
  const [start, end] = range.split("-");
  const phrase = range ? `按 ${range} 的班算` : "按这个班算";
  const parts: string[] = [];

  for (const f of inst.findings) {
    if (isLate(f.type)) {
      const t = firstTime(inst);
      const late = f.minutes ? `，比 ${start || "规定"} 的上班时间晚了 ${f.minutes} 分钟` : "，比规定的上班时间晚";
      parts.push(`你 ${t} 打的上班卡${late}。`);
    } else if (f.type === EARLY) {
      const t = lastTime(inst);
      const early = f.minutes ? `，比 ${end || "规定"} 的下班时间早了 ${f.minutes} 分钟` : "，比规定的下班时间早";
      parts.push(`你 ${t} 打的下班卡${early}。`);
    } else if (f.type === "MISSING_IN") {
      const t = firstTime(inst);
      parts.push(
        inst.single
          ? `这天只有 ${t} 这一张卡，所以记缺上班卡（${phrase}）。`
          : `上班卡没找到（${phrase}）。`
      );
    } else if (f.type === "MISSING_OUT") {
      const t = firstTime(inst);
      parts.push(
        inst.single
          ? `这天只有 ${t} 这一张卡，所以记缺下班卡（${phrase}）。`
          : `下班卡没找到（${phrase}）。`
      );
    }
  }

  if (!inst.findings.length) parts.push(`${phrase}，打卡时间对得上。`);
  return parts.join(" ");
}

function verdictLabel(findings: VerdictFinding[]): string {
  const kinds = new Set<string>();
  for (const f of findings) {
    if (isLate(f.type)) kinds.add("迟到");
    else if (f.type === EARLY) kinds.add("早退");
    else if (isMissing(f.type)) kinds.add("缺卡");
  }
  if (!kinds.size) return "正常";
  return [...kinds].join("、");
}

/** 某一天的员工版判定 + 依据 */
export function employeeDayCopy(row: DayVerdictRow): EmployeeDayCopy {
  if (row.noRule) {
    return {
      verdict: "暂时判不了",
      why: `你们组「${row.department}」还没配置上下班时间，这条先不算。`,
      flag: "",
    };
  }
  if (row.isLeave) {
    return { verdict: "请假", why: "这天是已批准的请假，不算考勤异常。", flag: "" };
  }
  if (!row.times.length) {
    return { verdict: "没有打卡", why: "这天没有打卡记录。", flag: "" };
  }

  const findings = row.instances.flatMap((x) => x.findings);
  const verdict = verdictLabel(findings);
  const why: string[] = [];

  for (const inst of row.instances) {
    const text = instanceWhy(inst);
    if (text) why.push(text);
  }

  if (row.borrowedPrevMonth.length) {
    why.push(`${row.borrowedPrevMonth.join("、")} 那张卡算到上月最后一天那个班，不算这一天。`);
  }
  if (row.borrowedInMonth.length) {
    why.push(`${row.borrowedInMonth.join("、")} 那张卡算到前一天那个班，不算这一天。`);
  }
  if (row.orphan.length) {
    why.push(`${row.orphan.join("、")} 那张卡没对上任何班，可能打早了或打晚了。`);
  }
  if (row.monthEdge) {
    why.push("下班卡可能打在第二天，而这批数据还没到那儿。");
  }
  if (row.noLaterPunch) {
    why.push("系统目前只看到这儿；如果后面还有卡没导进来，这条可能不准。");
  }

  return { verdict, why: why.join(""), flag: "" };
}

/** 某一天的异常清单（员工版）。与计数同源，保证摘要卡和列表不会互相打脸。 */
export function employeeAnomalies(row: DayVerdictRow): EmployeeAnomaly[] {
  const list: EmployeeAnomaly[] = [];
  for (const inst of row.instances) {
    for (const f of inst.findings) {
      // 迟到/早退的原卡就在这个班次里，可以直接预填；缺卡不猜时刻
      const suggestedTime = isLate(f.type) ? firstTime(inst) : f.type === EARLY ? lastTime(inst) : "";
      list.push({
        id: `${row.date}|${inst.shiftLabel}|${f.type}|${list.length}`,
        date: row.date,
        type: f.type,
        description: findingDescription(f, inst),
        minutes: f.minutes ?? null,
        suggestedTime,
      });
    }
  }
  return list;
}

export function countEmployeeAnomalies(list: EmployeeAnomaly[]): { late: number; missing: number } {
  return {
    late: list.filter((a) => isLate(a.type)).length,
    missing: list.filter((a) => isMissing(a.type)).length,
  };
}
