/**
 * 统计报表路由（P1：人员流动统计）。
 *
 * GET /api/stats/workforce（默认读策略 = 全员可看聚合数据）：
 * - 近 6 个月入职/离职趋势（离职取已批准的离职审批 decidedAt）
 * - 部门人数分布（在职 + 试用期）
 * - 员工状态分布
 *
 * GET /api/stats/attendance（P2：看板增强）
 * - days：近 30 天按日聚合的考勤状况（判定/出勤/迟到/早退/缺卡/未判定），供热力图渲染
 * - departmentRates：近 30 天部门出勤率排名（出勤人日 / 应出勤人日）
 *
 * 口径不在这里写：直接调 attendanceWindowStats，与异常分析、月报共用同一套
 * 「部门时段自动对班 + 班次实例判定」，看板不会再和考勤各说一套。
 */
import { Router } from "express";
import { db } from "./db.ts";
import { asString, asNumber } from "./sqliteUtil.ts";
import { attendanceWindowStats } from "./attendanceDb.ts";

export const statsRouter = Router();

/** 最近 n 个月（含当月），格式 YYYY-MM */
function lastMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

statsRouter.get("/workforce", (_req, res) => {
  const months = lastMonths(6);

  // 入职：按 joinDate 分月
  const hireRows = db
    .prepare(
      `SELECT substr(joinDate, 1, 7) AS m, COUNT(*) AS c
         FROM employees WHERE joinDate IS NOT NULL AND joinDate != ''
        GROUP BY m`
    )
    .all();
  const hireMap = new Map(hireRows.map((r) => [asString(r.m), asNumber(r.c)]));

  // 离职：已批准的离职审批按 decidedAt 分月
  const depRows = db
    .prepare(
      `SELECT substr(decidedAt, 1, 7) AS m, COUNT(*) AS c
         FROM approvals
        WHERE type = 'resign' AND status = 'approved' AND decidedAt IS NOT NULL
        GROUP BY m`
    )
    .all();
  const depMap = new Map(depRows.map((r) => [asString(r.m), asNumber(r.c)]));

  // 部门人数分布（不含离职）
  // 部门名一律按 departmentId 关联得出：employees.department 是写入时抄的副本，
  // 部门改名后不会自己更新，读它会让看板和档案列表各说一套。
  const deptRows = db
    .prepare(
      `SELECT COALESCE(NULLIF(d.name, ''), NULLIF(e.department, ''), '未分配') AS dept, COUNT(*) AS c
         FROM employees e
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE e.status != '离职'
        GROUP BY dept ORDER BY c DESC`
    )
    .all();

  // 状态分布
  const statusRows = db.prepare(`SELECT status, COUNT(*) AS c FROM employees GROUP BY status`).all();

  res.json({
    months,
    hires: months.map((m) => hireMap.get(m) ?? 0),
    departures: months.map((m) => depMap.get(m) ?? 0),
    departments: deptRows.map((r) => ({ name: asString(r.dept), count: asNumber(r.c) })),
    statuses: Object.fromEntries(statusRows.map((r) => [asString(r.status), asNumber(r.c)])),
  });
});

/** 近 n 个自然日（含今天），格式 YYYY-MM-DD */
function lastDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }
  return days;
}

statsRouter.get("/attendance", (_req, res) => {
  // 口径与考勤模块完全一致（部门时段自动对班 + 班次实例判定）：
  // 聚合逻辑放在 attendanceDb.attendanceWindowStats，看板不再自己抄一份判定。
  // 返回的 days 已按传入日期逐日展开，直接给热力图用。
  res.json(attendanceWindowStats(lastDays(30)));
});
