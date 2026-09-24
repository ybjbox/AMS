/**
 * 打卡/班次的日期时间格式回归（全系统检查 C2 + C5）。
 *
 * 钉住两类真实错法：
 *  - `2026-9-1` / `9:00` 这种"看着没问题"的写法：范围查询按 TEXT 字典序比，脏日期永远查不到；
 *    而 (employeeId,date,time) 唯一键会把 9:00 与 09:00:00 当成两个不同分钟 → 同一分钟落两条卡，
 *    月报的打卡次数、出勤天数与"只有一张卡=缺卡"判定全部跟着错。
 *  - 到期天数用 `new Date('YYYY-MM-DD') - Date.now()`：UTC 零点减本地时刻，凌晨段会多算一天。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import {
  PunchFormatError,
  insertSourcedRecords,
  normalizeClockTime,
  normalizePunchDate,
  normalizePunchTime,
} from "../attendanceDb.ts";
import { daysUntilLocal, localToday } from "../localDate.ts";
import { attendanceRouter } from "../attendanceRouter.ts";
import type { SessionContext } from "../authDb.ts";

let apiServer: Server;
let base = "";
let emp = { id: "", name: "" };

beforeAll(async () => {
  emp = createEmployee({ name: "考勤格式测试甲" })!;
  const app = express();
  app.use((req, _res, next) => {
    (req as { auth?: unknown }).auth = {
      username: "mock-hr-format",
      systemRole: "HR" as SessionContext["systemRole"],
      employeeId: null,
      displayName: "mock",
      email: "",
      mustChangePassword: false,
    } satisfies SessionContext;
    next();
  });
  app.use("/api/attendance", attendanceRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/attendance`;
});

afterAll(() => {
  db.prepare("DELETE FROM punch_records WHERE employeeId = ?").run(emp.id);
  db.prepare("DELETE FROM shifts WHERE name LIKE '格式测试%'").run();
  deleteEmployee(emp.id);
  apiServer.close();
});

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};
const rowCount = (date: string, time: string) =>
  db.prepare("SELECT COUNT(*) c FROM punch_records WHERE employeeId=? AND date=? AND time=?").get(emp.id, date, time)?.c as number;

describe("纯函数归一", () => {
  it("日期补零、斜杠也接受；月份/日期越界拒绝", () => {
    expect(normalizePunchDate("2026-9-1")).toBe("2026-09-01");
    expect(normalizePunchDate("2026-09-01")).toBe("2026-09-01");
    // 带时刻的整串不在受理范围（导入通道会先拆成日期），必须明确拒绝而不是悄悄截断
    expect(() => normalizePunchDate("2026-09-01T00:00:00")).toThrow(PunchFormatError);
    expect(() => normalizePunchDate("2026-13-01")).toThrow(PunchFormatError);
    expect(() => normalizePunchDate("not-a-date")).toThrow(/日期格式/u);
  });

  it("时间补齐到 HH:mm:ss 并校验时分上界；班次用 HH:mm", () => {
    expect(normalizePunchTime("9:00")).toBe("09:00:00");
    expect(normalizePunchTime("09:00:33")).toBe("09:00:33");
    expect(() => normalizePunchTime("25:00")).toThrow(/时间不合法/u);
    expect(() => normalizePunchTime("09:60")).toThrow(PunchFormatError);
    expect(normalizeClockTime("9:00")).toBe("09:00");
    expect(normalizeClockTime("09:00:30")).toBe("09:00");
  });

  it("到期天数按本地日历日算：凌晨段不多算一天（旧写法会）", () => {
    // 2026-09-24 03:00（UTC+8）看 09-25：真实相差 1 天；
    // 旧的 `new Date('2026-09-25') - Date.now()` 取的是 UTC 零点，会算成 2 天
    const earlyMorning = new Date(2026, 8, 24, 3, 0, 0);
    expect(daysUntilLocal("2026-09-25", earlyMorning)).toBe(1);
    expect(daysUntilLocal("2026-09-24", earlyMorning)).toBe(0);
    expect(daysUntilLocal("2026-09-23", earlyMorning)).toBe(-1);
    expect(daysUntilLocal("", earlyMorning)).toBe(0);
    expect(daysUntilLocal(null, earlyMorning)).toBe(0);
  });
});

describe("写路径实际行为", () => {
  it("脏格式落库前归一，同一分钟不会再落第二条", async () => {
    const dirty = await post("/records", { employeeId: emp.id, employeeName: emp.name, date: "2026/9/2", time: "9:05" });
    expect(dirty.status).toBe(201);
    expect(rowCount("2026-09-02", "09:05:00")).toBe(1);

    const same = await post("/records", { employeeId: emp.id, employeeName: emp.name, date: "2026-09-02", time: "09:05:00" });
    expect(same.status).toBe(201);
    expect(rowCount("2026-09-02", "09:05:00")).toBe(1); // 关键断言：不是 2
    expect(rowCount("2026-9-2", "9:05")).toBe(0); // 库里不再有第二种写法
  });

  it("坏日期/坏时间给 400 + 中文原因，不是 500", async () => {
    const badDate = await post("/records", { employeeId: emp.id, employeeName: emp.name, date: "昨天", time: "09:00" });
    expect(badDate.status).toBe(400);
    expect(String(badDate.json.error)).toMatch(/日期格式/u);
    const badTime = await post("/records", { employeeId: emp.id, employeeName: emp.name, date: "2026-09-03", time: "9点" });
    expect(badTime.status).toBe(400);
    expect(String(badTime.json.error)).toMatch(/时间格式/u);
    expect(rowCount("2026-09-03", "09:00:00")).toBe(0);
  });

  it("班次时间也归一（9:00 的班次过去会让 toMinutes 解析成 NaN）", async () => {
    const created = await post("/shifts", { name: "格式测试班", startTime: "9:00", endTime: "18:00" });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ startTime: "09:00", endTime: "18:00" });
  });

  it("外部来源批量写入：一行坏格式就整批拒绝，不留半批", () => {
    const before = db.prepare("SELECT COUNT(*) c FROM punch_records WHERE employeeId=?").get(emp.id)?.c as number;
    expect(() =>
      insertSourcedRecords([
        { employeeId: emp.id, employeeName: emp.name, date: "2026-09-04", time: "08:00:00", source: "wecom" },
        { employeeId: emp.id, employeeName: emp.name, date: "2026-09-04", time: "迟到", source: "wecom" },
      ])
    ).toThrow(PunchFormatError);
    expect(db.prepare("SELECT COUNT(*) c FROM punch_records WHERE employeeId=?").get(emp.id)?.c).toBe(before);
  });
});

describe("月报默认月份", () => {
  it("不带 month 时取本地当月（UTC 口径下每月 1 日凌晨会查成上月）", async () => {
    const res = await fetch(`${base}/summary`);
    const json = (await res.json()) as { month: string };
    expect(json.month).toBe(localToday().slice(0, 7));
  });
});
