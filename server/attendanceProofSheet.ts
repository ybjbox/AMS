/**
 * 考勤判定「人工校对表」——把一个月的逐人逐日判定连同判定依据导出成 Excel。
 *
 * 这份表是给 HR 拿着逐行核对的：每行写清「当天有几张卡、对上了哪个班次、为什么这么判」，
 * 并把系统自己都觉得可疑的行标出来 —— 没能归属的卡、跨零点的边界、单卡、部门没配时段。
 * 月报和异常分析只能告诉 HR「有 70 条异常」，没法回答「凭哪张卡、哪条时段判的」；
 * 人工核对必须能看到中间那一步，否则就只能盲信或重算，两头都不对。
 *
 * 本文件**只排版**：判定装配全部来自 `attendanceDayVerdicts.buildMonthDayVerdicts()`，
 * 那一份结果同时也喂给界面。屏幕上那行「判定 / 判定依据 / ★」与表格里那三列因此必然是
 * 同一串字 —— 不会出现两边各算一份、人核对完还得再信一次系统的情况。
 */
import ExcelJS from "exceljs";
import { db } from "./db.ts";
import { type DbRow, asString } from "./sqliteUtil.ts";
import { listDeptShiftRules, resolveRulesForDepartment, type DeptShiftRule } from "./shiftRulesDb.ts";
import {
  formatWorkdays,
  LATE_MINUTES,
  LATE_SERIOUS_MINUTES,
  MATCH_TOLERANCE_MINUTES,
  MAX_INSTANCE_SPAN_MINUTES,
  OVERTIME_GRACE_MINUTES,
} from "./shiftMatch.ts";
import { buildMonthDayVerdicts, type MonthVerdicts } from "./attendanceDayVerdicts.ts";

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

/**
 * 导出某月的考勤判定人工校对表。
 *
 * @param month `YYYY-MM`；非法格式由 `buildMonthDayVerdicts` 抛错 —— 拼出一个空表
 *   会让人以为"这个月没人打卡"，那比报错糟糕得多。
 * @param pre 已经算好的装配结果。界面与导出必须同源，所以谁手上已经有这份数据
 *   就传进来，别再算第二遍（回归测试靠这个接缝保证"表格里的行"与"接口返回的行"
 *   出自同一次装配 —— 两次分别装配会在并发写库时飘）。
 */
export async function buildAttendanceProofSheet(month: string, pre?: MonthVerdicts): Promise<Buffer> {
  const v = pre ?? buildMonthDayVerdicts(month);

  const wb = new ExcelJS.Workbook();

  // ═════════ Sheet1 逐人逐日 ═════════
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

  for (const d of v.days) {
    const row = s1.addRow({
      id: d.employeeId,
      name: d.employeeName,
      job: d.job,
      dept: d.department,
      date: d.date,
      dow: d.weekday,
      raw: d.times.length ? d.times.join(" ") : "—",
      n: d.times.length,
      sn: d.instances.length,
      shifts: d.shiftSummary,
      spans: d.spanSummary,
      late: d.lateText,
      early: d.earlyText,
      miss: d.missingText,
      verdict: d.verdict,
      why: d.why,
      flag: d.flag,
      manual: "",
    });
    row.getCell("verdict").fill = fillOf(`FF${FILL[verdictFillKey(d.verdict)] ?? FILL["未对班"]}`);
    if (d.flag) {
      row.getCell("flag").fill = fillOf(d.flag.startsWith("★") ? "FFFFC7CE" : "FFFFE0B2");
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
    { header: `是否计入${v.month}`, key: "in", width: 13 },
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

  for (const rec of v.instances) {
    const row = s2.addRow({
      id: rec.employeeId,
      name: rec.employeeName,
      dept: rec.department,
      date: rec.date,
      in: rec.inReport ? "是" : "否（上下文）",
      shift: rec.shiftLabel,
      n: rec.times.length,
      times: rec.times.join("  "),
      span: rec.single ? "单卡" : `${rec.spanTxt} (${(rec.spanMin / 60).toFixed(1)}h)`,
      cross: rec.cross ? "是" : "",
      late: rec.late ?? "",
      early: rec.early ?? "",
      verdict: rec.verdict,
      why: rec.why,
      flag: rec.flag,
      manual: "",
    });
    // 班次实例这一层只会出现正常/迟到/早退/缺卡/请假五类；verdictFillKey 的兜底「未对班」
    // 在这里是"没有任何 finding"，也就是正常，不能拿灰色去涂。
    const fillKey = rec.isLeave ? "请假" : rec.findings.length === 0 ? "正常" : verdictFillKey(rec.verdict);
    row.getCell("verdict").fill = fillOf(`FF${FILL[fillKey]}`);
    if (!rec.inReport) row.getCell("in").fill = fillOf("FFFFF3E0");
    if (rec.flag) row.getCell("flag").fill = fillOf(rec.flag === "已批准请假" ? "FFE8F0F6" : "FFFFE0B2");
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
  const activeRows = db
    .prepare(
      `SELECT e.id AS id, e.name AS name, e.departmentId AS departmentId,
              COALESCE(NULLIF(d.name, ''), NULLIF(e.department, ''), '未分配') AS dept
         FROM employees e
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE e.status != '离职'`
    )
    .all() as unknown as DbRow[];
  const usersByRuleDept = new Map<string, string[]>();
  for (const row of activeRows) {
    const id = asString(row.id);
    if (!v.punchedEmployeeIds.has(id)) continue;
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
  for (const emp of v.employees) {
    // 没配时段又确实来打过卡才算问题；整月没卡的人不参与判定，不该算进这里
    if (!emp.noRule || !emp.hasPunches) continue;
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
  const s4 = wb.addWorksheet("判定规则");
  s4.columns = [
    { header: "项", key: "k", width: 34 },
    { header: "口径 / 取值", key: "v", width: 104 },
  ];
  styleHeader(s4.getRow(1));

  const rules4: [string, string][] = [
    ["月份", `${v.month}（${v.monthStart} … ${v.monthEnd}，共 ${v.dayCount} 天）`],
    ["数据来源", `数据库 punch_records 表，只读，未修改任何原始打卡记录`],
    ["取数范围", `${v.from} … ${v.to}（两端各多取一天，用于把跨零点的班接上；两端不在本表内，只作上下文）`],
    ["人员", `在职 ${v.employees.length} 人 × ${v.dayCount} 天；有打卡的「人·日」${v.punchedPersonDays} 个，卡 ${v.punchTotal} 张；本表 ${v.days.length} 行`],
    ["判定实现", "server/shiftMatch.ts（buildShiftInstances / judgeOffsets），与「异常分析」「月度报表」同一份实现，导出不改判定阈值"],
    ["对班依据", "部门工作时段优先（没配则沿部门树向上继承），其次回退逐日排班；两者都没有则不判定，见 Sheet3 末尾"],
    ["跨零点", `整段打卡按绝对分钟排序串联；单班最长跨 ${MAX_INSTANCE_SPAN_MINUTES / 60} 小时`],
    ["窗口平移", "班次窗口可整体平移 ±1440 分钟：00:00 上班的人在 23:45 打卡，命中的是次日 00:00 那次上班（偏差 15 分钟而不是 1425 分钟）"],
    ["首卡容差", `${MATCH_TOLERANCE_MINUTES} 分钟`],
    ["迟到分档", `超过 ${LATE_SERIOUS_MINUTES} 分钟记「迟到(>15分)」；超过 ${LATE_MINUTES} 分钟记「迟到(>5分)」`],
    ["早退", "末卡早于下班点即记早退"],
    ["单卡天", "只有一张卡时按班次中点猜缺哪张；中点之前记缺下班卡，之后记缺上班卡"],
    ["加班余量", `下班点之后 ${OVERTIME_GRACE_MINUTES} 分钟内的卡还算这个班的；超过就不收，另作未归属卡。可按部门时段单独配置（见 Sheet3）`],
    ["跨月处理", `${v.monthStart} 之前 / ${v.monthEnd} 之后的班次实例（${v.contextInstanceCount} 个）只作上下文把班接上，不计入本月；Sheet2 标为「否（上下文）」并加底色`],
    ["已批准请假", `本月 ${v.leaveInstanceCount} 个班次落在已批准请假日，按产品口径不判考勤异常（与月报、异常分析一致），本表标为「请假」而不是隐藏`],
    ["", ""],
    ["【★需人工确认】", `共 ${v.needCheckNotes.length} 行（Sheet1 已用 ★ 标出并加红底）`],
    ["清单", v.needCheckNotes.length ? v.needCheckNotes.join("；") : "（无）"],
    ["", ""],
    ["【底色含义】", "浅绿=正常　浅黄=迟到　浅橙=早退　浅红=缺卡　浅灰=未对班/无打卡　浅蓝=请假或班次归前一日　浅紫=未配置时段"],
    ["【★的几种情况】", "★未配置时段=部门没有时段也没排班，不判定；★无法归属=有卡但对不上任何时段；★有未归属卡=存在与上班时间相差过大的卡；★下班卡可能在次日=记录尚未覆盖次日，分不清是缺卡还是没导数据"],
  ];
  for (const [k, text] of rules4) {
    const row = s4.addRow({ k, v: text });
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
