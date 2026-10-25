/**
 * 员工自助端点（/api/my/*）。
 *
 * 只回答一个问题："我自己这个月被怎么判的"。所有查询都以 `req.auth.employeeId` 收口——
 * 不接受前端传 employeeId，避免把 HR 侧那套宽表权限复制到员工端。
 */
import { Router } from "express";
import { listMine } from "./approvalsDb.ts";
import { punchCoverage } from "./attendanceDb.ts";
import { buildMonthDayVerdicts, MONTH_RE } from "./attendanceDayVerdicts.ts";
import { countEmployeeAnomalies, employeeAnomalies, employeeDayCopy, type EmployeeAnomaly } from "./employeeCopy.ts";
import { localToday } from "./localDate.ts";

export const myRouter = Router();

myRouter.use((req, res, next) => {
  if (!req.auth?.employeeId) {
    return res
      .status(409)
      .json({ error: "这个账号还没绑定员工档案——请让管理员在「审批中心 → 待核对」里核对开通", code: "NO_EMPLOYEE_BOUND" });
  }
  next();
});

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

/** 我的本月判定：结论 + 依据 + 数据截止日 */
myRouter.get("/summary", (req, res) => {
  const month = String(req.query.month ?? "") || currentMonth();
  if (!MONTH_RE.test(month)) return res.status(400).json({ error: "月份格式应为 YYYY-MM" });

  const employeeId = req.auth!.employeeId!;
  const coverage = punchCoverage();
  // 只交"到数据截止日为止、且已经过去"的那些天。否则这个月还没到的日子、以及数据
  // 没导进来的日子，都会以「无打卡」出现在员工面前——那等于把"没数据"说成"你没打卡"。
  const today = localToday();
  const upper = coverage.latestDate && coverage.latestDate < today ? coverage.latestDate : today;

  const days = buildMonthDayVerdicts(month).days.filter((d) => d.employeeId === employeeId && d.date <= upper);
  const verdicts = days.map((d) => {
    const issues = employeeAnomalies(d);
    return {
      date: d.date,
      ...employeeDayCopy(d),
      isLeave: d.isLeave,
      noRule: d.noRule,
      // 未配时段不是「没问题」：整条判断不了，必须让员工看到这一行，而不是空白
      hasIssue: issues.length > 0 || d.noRule,
    };
  });
  const anomalies: EmployeeAnomaly[] = days.flatMap((d) => employeeAnomalies(d));

  // 计数与列表必须同源：之前用 verdict.includes("缺卡") 匹配「缺下班卡」，
  // 子串并不连续，于是摘要卡永远显示 0，而下面明明列着一条缺卡。
  const counts = countEmployeeAnomalies(anomalies);

  res.json({ month, employeeId, coverage, verdicts, anomalies, counts });
});

/** 我提过的异议（复用审批台账，只能看自己的） */
myRouter.get("/disputes", (req, res) => {
  res.json(listMine(req.auth!.username));
});
