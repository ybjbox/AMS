/**
 * 判定装配与校对表导出**必须逐字同源**的回归测试。
 *
 * `buildMonthDayVerdicts()` 现在同时喂两个消费者：界面（GET /day-verdicts）和
 * Excel 校对表。这个测试不校验判定值本身（那是 `attendance-proof-sheet.test.ts`
 * 与 shiftMatch 自己的用例在做），只校验一件事：**同一份数据，两处读到的
 * 「判定 / 判定依据 / ★需确认 / 迟到 / 早退 / 缺卡 / 班次 / 时长」完全相等**。
 * 以后谁在任一边单独改文案或补一段推导，这里立刻红 —— 而不是等到 HR 发现
 * 屏幕上的结论和导出的表对不上，再回头信不过整个系统。
 *
 * 用例自造数据（临时 DATA_DIR），覆盖生产数据上碰不到的分支：未配时段部门、
 * 未归属卡、跨零点的两种归属、月末记录边界、已批准请假日。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { runMigrations } from "../migrate.ts";
import { createDeptShiftRule, deleteDeptShiftRule } from "../shiftRulesDb.ts";
import { upsertRecord } from "../attendanceDb.ts";
import { createApproval, decideApproval, ensureApprovalsTable } from "../approvalsDb.ts";
import { createAccount, deleteAccount } from "../authDb.ts";
import { buildMonthDayVerdicts, type DayVerdictRow } from "../attendanceDayVerdicts.ts";
import { buildAttendanceProofSheet } from "../attendanceProofSheet.ts";

const MONTH = "2026-09";
const LEAVE_USER = "qa-verdict-leave";

const depts = [
  { id: "qa-verdict-plain", name: "校对平班组" },
  { id: "qa-verdict-night", name: "校对夜班组" },
  { id: "qa-verdict-none", name: "校对无班组" },
];
const ruleIds: string[] = [];
/** 工号由 `createEmployee` 自己发（不接受传入 id），所以按代号记住生成出来的那个 */
const who = new Map<string, string>();

/** 建一个挂在该部门的人，并按给定 [日期, 时间] 打卡 */
function seed(key: string, name: string, deptId: string, punches: [string, string][]): string {
  const emp = createEmployee({ name, departmentId: deptId });
  const id = String((emp as unknown as { id: string }).id);
  who.set(key, id);
  for (const [date, time] of punches) upsertRecord({ employeeId: id, employeeName: name, date, time });
  return id;
}

beforeAll(() => {
  runMigrations();
  for (const d of depts) db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run(d.id, d.name);

  ruleIds.push(
    createDeptShiftRule({
      departmentId: "qa-verdict-plain",
      name: "常规班次",
      startTime: "08:00",
      endTime: "18:00",
      workdays: [1, 2, 3, 4, 5, 6, 7],
    }).id,
    createDeptShiftRule({
      departmentId: "qa-verdict-night",
      name: "小夜",
      startTime: "17:30",
      endTime: "01:00",
      workdays: [1, 2, 3, 4, 5, 6, 7],
    }).id
  );

  // 正常 / 迟到两档 / 早退 / 单卡 / 未归属卡
  seed("normal", "校对正常", "qa-verdict-plain", [
    ["2026-09-05", "08:00"],
    ["2026-09-05", "18:00"],
  ]);
  seed("late", "校对迟到", "qa-verdict-plain", [
    ["2026-09-05", "08:20"],
    ["2026-09-05", "18:00"],
    ["2026-09-06", "08:07"],
    ["2026-09-06", "18:00"],
  ]);
  seed("early", "校对早退", "qa-verdict-plain", [
    ["2026-09-05", "08:00"],
    ["2026-09-05", "17:30"],
  ]);
  seed("single", "校对单卡", "qa-verdict-plain", [["2026-09-05", "08:00"]]);
  seed("orphan", "校对余卡", "qa-verdict-plain", [
    ["2026-09-05", "08:00"],
    ["2026-09-05", "18:00"],
    ["2026-09-05", "03:17"],
  ]);
  // 整条部门链都没有时段 → ★未配置时段
  seed("norule", "校对无班", "qa-verdict-none", [["2026-09-05", "09:00"]]);
  // 跨零点：09-01 那张 00:03 属于 08-31 的班（归上月）；月中那组归前一日
  seed("night", "校对夜班", "qa-verdict-night", [
    ["2026-08-31", "17:35"],
    ["2026-09-01", "00:03"],
    ["2026-09-15", "17:30"],
    ["2026-09-16", "00:40"],
  ]);
  // 月末记录边界：库里的最后一张卡就停在这天，而窗口要到次日 01:00
  seed("edge", "校对月末", "qa-verdict-night", [["2026-09-30", "17:30"]]);

  // 已批准请假：判定栏要写「请假」，迟到/早退/缺卡三格必须跟着清空
  ensureApprovalsTable();
  const leaveEmp = seed("leave", "校对请假", "qa-verdict-plain", [["2026-09-10", "10:00"]]);
  createAccount({ username: LEAVE_USER, password: "Qa-verdict-2026!", employeeId: leaveEmp, systemRole: "EMPLOYEE" });
  const leave = createApproval({
    applicant: LEAVE_USER,
    type: "leave",
    startDate: "2026-09-10",
    endDate: "2026-09-10",
    reason: "事假",
  });
  decideApproval(leave.id, "approved", "qa-verdict-boss", "同意", "ADMIN");
});

afterAll(() => {
  db.prepare("DELETE FROM approvals WHERE applicant = ?").run(LEAVE_USER);
  deleteAccount(LEAVE_USER);
  for (const id of who.values()) {
    db.prepare("DELETE FROM punch_records WHERE employeeId = ?").run(id);
    deleteEmployee(id);
  }
  for (const id of ruleIds) deleteDeptShiftRule(id);
  for (const d of depts) db.prepare("DELETE FROM departments WHERE id = ?").run(d.id);
});

/** Sheet1 表头 → 列号（读回的文件里 columns 元数据不一定带 header，只能按第一行找） */
function sheetColumns(sheet: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  sheet.getRow(1).eachCell((c, col) => map.set(String(c.value ?? "").trim(), col));
  return map;
}

const COMPARE: { header: string; field: keyof DayVerdictRow | "times" }[] = [
  { header: "原始记录", field: "times" },
  { header: "判定", field: "verdict" },
  { header: "判定依据", field: "why" },
  { header: "★需确认", field: "flag" },
  { header: "对上的班次", field: "shiftSummary" },
  { header: "班内时长", field: "spanSummary" },
  { header: "迟到(分)", field: "lateText" },
  { header: "早退(分)", field: "earlyText" },
  { header: "缺卡类型", field: "missingText" },
];

/** 装配结果只依赖 beforeAll 播种的静态数据，算一次就够（每调一次全月重算要 1 秒多） */
let cached: ReturnType<typeof buildMonthDayVerdicts> | null = null;
const verdicts = () => (cached ??= buildMonthDayVerdicts(MONTH));
const day = (key: string, date: string): DayVerdictRow | undefined =>
  verdicts().days.find((d) => d.employeeId === who.get(key) && d.date === date);

describe("day-verdicts 与校对表 Sheet1 同源", () => {
  it("逐行比判定/依据/★/迟到/早退/缺卡/班次/时长，一处不等即失败", async () => {
    const ours = new Set(who.values());
    const v = verdicts();
    const days = v.days.filter((d) => ours.has(d.employeeId));
    expect(days.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    // 把同一份装配交给导出：表格里的行与接口返回的行于是出自**同一次**计算。
    // 分头各算一次时，并发写库的其它测试文件会让两边的行数对不上（偶发红）。
    await wb.xlsx.load(await buildAttendanceProofSheet(MONTH, v));
    const s1 = wb.getWorksheet("逐人逐日")!;
    const col = sheetColumns(s1);
    const read = (row: ExcelJS.Row, header: string) => {
      const raw = row.getCell(col.get(header)!).value;
      return raw === null || raw === undefined ? "" : String(raw);
    };

    const byKey = new Map(days.map((d) => [`${d.employeeId}|${d.date}`, d]));
    const seen = new Set<string>();
    const diffs: string[] = [];
    let sheetRows = 0;
    s1.eachRow((row, n) => {
      if (n === 1) return;
      if (!ours.has(read(row, "工号"))) return;
      sheetRows += 1;
      const key = `${read(row, "工号")}|${read(row, "日期")}`;
      seen.add(key);
      const d = byKey.get(key);
      if (!d) {
        diffs.push(`${key}：只在导出里，界面取不到这一天`);
        return;
      }
      for (const { header, field } of COMPARE) {
        const fromSheet = read(row, header);
        const fromJson =
          field === "times" ? (d.times.length ? d.times.join(" ") : "—") : String(d[field as keyof DayVerdictRow] ?? "");
        if (fromSheet !== fromJson) diffs.push(`${key} 的「${header}」：导出「${fromSheet}」≠ 界面「${fromJson}」`);
      }
    });
    for (const key of byKey.keys()) if (!seen.has(key)) diffs.push(`${key}：只在 day-verdicts 里，导出没有这行`);

    expect(diffs).toEqual([]);
    // 两个方向的键集都查过了，总数再钉一次
    expect(sheetRows).toBe(days.length);
  });
});

describe("分支真的被数据打到（否则上面的对账是空转）", () => {
  it("正常 / 迟到两档 / 早退 / 单卡", () => {
    expect(day("normal", "2026-09-05")?.verdict).toBe("正常");
    expect(day("late", "2026-09-05")?.verdict).toBe("迟到(>15分)");
    expect(day("late", "2026-09-06")?.verdict).toBe("迟到(>5分)");
    expect(day("early", "2026-09-05")?.verdict).toBe("早退");
    expect(day("single", "2026-09-05")?.flag).toBe("单卡");
  });

  it("★：未归属卡 / 未配置时段 / 下班卡可能在次日", () => {
    expect(day("orphan", "2026-09-05")?.flag).toBe("★有未归属卡");
    const noRule = day("norule", "2026-09-05");
    expect(noRule?.flag).toBe("★未配置时段");
    expect(noRule?.verdict).toBe("未配置时段");
    expect(day("edge", "2026-09-30")?.flag).toBe("★下班卡可能在次日");
  });

  it("跨零点：09-01 的凌晨卡归上月，月中那张归前一日，当天不重复计出勤", () => {
    const first = day("night", "2026-09-01");
    expect(first?.verdict).toBe("班次归前一日");
    expect(first?.flag).toBe("班次归上月");
    expect(first?.borrowedPrevMonth).toEqual(["00:03"]);
    const mid = day("night", "2026-09-16");
    expect(mid?.flag).toBe("班次归前一日");
    expect(mid?.borrowedInMonth).toEqual(["00:40"]);
  });

  it("请假日：判定写「请假」，迟到/早退/缺卡三格必须是空的", () => {
    const leave = day("leave", "2026-09-10");
    expect(leave?.verdict).toBe("请假");
    expect(leave?.flag).toBe("");
    expect(leave?.missingText).toBe("");
    expect(leave?.lateText).toBe("");
    expect(leave?.earlyText).toBe("");
    expect(leave?.why).toContain("已批准请假");
  });
});
