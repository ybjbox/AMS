/**
 * 统计报表路由（P1：人员流动统计）。
 *
 * GET /api/stats/workforce（默认读策略 = 全员可看聚合数据）：
 * - 近 6 个月入职/离职趋势（离职取已批准的离职审批 decidedAt）
 * - 部门人数分布（在职 + 试用期）
 * - 员工状态分布
 *
 * GET /api/stats/attendance（P2：看板增强）
 * - heatmap：近 30 天按日聚合的考勤状况（出勤/迟到/早退/缺卡人数），供热力图渲染
 * - departments：近 30 天部门出勤率排名（出勤人日 / 应出勤人日）
 */
import { Router } from "express";
import { db } from "./db.ts";
import { asString, asNumber } from "./sqliteUtil.ts";

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
  const days = lastDays(30);

  // 班次与排班（判定迟到/早退/缺卡的口径与异常分析一致）
  const shifts = db.prepare("SELECT id, startTime, endTime FROM shifts").all();
  const shiftMap = new Map(shifts.map((s) => [asString(s.id), s]));
  const schedules = db.prepare("SELECT employeeId, shiftIds FROM schedules").all();
  const scheduleMap = new Map(schedules.map((r) => [asString(r.employeeId), r]));

  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // 部门归属（用于部门出勤率）——同样按 departmentId 联查，避免读到改名前的陈旧副本
  const deptRows = db
    .prepare(
      `SELECT e.id AS id, COALESCE(NULLIF(d.name, ''), NULLIF(e.department, ''), '未分配') AS dept
         FROM employees e
         LEFT JOIN departments d ON d.id = e.departmentId
        WHERE e.status != '离职'`
    )
    .all();
  const deptOf = new Map(deptRows.map((r) => [asString(r.id), asString(r.dept)]));

  // 打卡记录按 员工+日期 分组
  const punchRows = db
    .prepare(
      `SELECT employeeId, date, time FROM punch_records
        WHERE date >= ? AND date <= ?`
    )
    .all(days[0], days[days.length - 1]);
  const punches = new Map<string, string[]>();
  for (const r of punchRows) {
    const key = `${asString(r.employeeId)}__${asString(r.date)}`;
    const list = punches.get(key) ?? [];
    list.push(asString(r.time));
    punches.set(key, list);
  }

  // 逐日聚合：出勤/迟到/早退/缺卡 人数（仅统计当日已排班员工）
  const heatmap = days.map((day) => {
    let present = 0, late = 0, early = 0, missing = 0, scheduled = 0;
    for (const [employeeId] of deptOf) {
      const sched = scheduleMap.get(employeeId);
      if (!sched) continue;
      const shiftIds = JSON.parse(asString(sched.shiftIds) || "[]") as string[];
      const shift = shiftIds.map((id) => shiftMap.get(id)).find(Boolean);
      if (!shift) continue;
      scheduled += 1;
      const times = (punches.get(`${employeeId}__${day}`) ?? []).map((t) => t.slice(0, 5)).sort();
      if (times.length === 0) continue; // 未打卡不算出勤（缺勤/请假，热力图不计缺卡）
      if (times.length === 1) {
        missing += 1;
        continue;
      }
      present += 1;
      const inMin = toMin(times[0]);
      const outMin = toMin(times[times.length - 1]);
      if (inMin - toMin(asString(shift.startTime)) > 15) late += 1;
      if (toMin(asString(shift.endTime)) - outMin > 0) early += 1;
    }
    return { date: day, present, late, early, missing, scheduled };
  });

  // 部门出勤率：出勤人日 / 应出勤人日（有排班且有打卡记录的日期）
  const deptAgg = new Map<string, { attended: number; expected: number }>();
  for (const [employeeId, dept] of deptOf) {
    const sched = scheduleMap.get(employeeId);
    if (!sched) continue;
    const shiftIds = JSON.parse(asString(sched.shiftIds) || "[]") as string[];
    if (!shiftIds.map((id) => shiftMap.get(id)).find(Boolean)) continue;
    const agg = deptAgg.get(dept) ?? { attended: 0, expected: 0 };
    for (const day of days) {
      // 周末不计应出勤
      const dow = new Date(day).getDay();
      if (dow === 0 || dow === 6) continue;
      agg.expected += 1;
      if ((punches.get(`${employeeId}__${day}`) ?? []).length > 0) agg.attended += 1;
    }
    deptAgg.set(dept, agg);
  }
  const departmentRates = [...deptAgg.entries()]
    .map(([name, v]) => ({
      name,
      rate: v.expected > 0 ? Math.round((v.attended / v.expected) * 1000) / 10 : 0,
      attended: v.attended,
      expected: v.expected,
    }))
    .sort((a, b) => b.rate - a.rate);

  res.json({ days: heatmap, departmentRates });
});
