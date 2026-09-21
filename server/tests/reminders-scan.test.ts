/**
 * 到期提醒扫描（服务端版）回归测试：
 *  1. 收件人只含启用中的 HR 及以上——普通员工绝不能再因为"打开了浏览器"收到全员合同到期提醒；
 *  2. 命中窗口才生成：离职、已过期、超出窗口都不算；
 *  3. 幂等：重复扫描不堆待办，通知按 refKey 原地刷新（这是 v9 归并的延续）。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用例自造数据并在结尾清理干净。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { createAccount, deleteAccount } from "../authDb.ts";
import { remindersRouter } from "../remindersRouter.ts";
import {
  collectReminderItems,
  listReminderRecipients,
  scanReminders,
  getReminderConfig,
  setReminderConfig,
} from "../remindersDb.ts";

const PW = "Remind#Test2026-aa";
const HR = "rem-test-hr";
const STAFF = "rem-test-staff";
const OFF = "rem-test-off";

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function plusDays(days: number): string {
  return iso(new Date(Date.now() + days * 86_400_000));
}
/** 与 remindersDb.plusMonths 对偶：入职日 = 转正日 - 3 个月 */
function minusMonths(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return iso(new Date(y, m - 1 - months, d));
}

let soon = "";
let empSoon = { id: "", name: "" };
let empProbation = { id: "", name: "" };
let empResigned = { id: "", name: "" };
let empFar = { id: "", name: "" };

const CONFIG = { contractExpiryDays: 30, probationConversionDays: 15 };

function todosOf(username: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM todos
        WHERE createdBy = ? AND type IN ('contract','probation') AND targetId IN (?, ?, ?, ?)`
    )
    .get(username, empSoon.id, empProbation.id, empResigned.id, empFar.id) as unknown as { n: number | bigint };
  return Number(row.n ?? 0);
}
function notificationsOf(recipient: string, refKey: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient = ? AND refKey = ?")
    .get(recipient, refKey) as unknown as { n: number | bigint };
  return Number(row.n ?? 0);
}

let httpServer: Server;
let apiBase = "";

beforeAll(async () => {
  soon = plusDays(10);
  empSoon = createEmployee({ name: "提醒测试-合同将至", contractExpiry: soon, status: "在职" })!;
  const conversionDay = plusDays(5);
  empProbation = createEmployee({
    name: "提醒测试-试用期内",
    status: "试用期",
    joinDate: minusMonths(conversionDay, 3),
    contractExpiry: "",
  })!;
  empResigned = createEmployee({ name: "提醒测试-已离职", contractExpiry: plusDays(3), status: "离职" })!;
  empFar = createEmployee({ name: "提醒测试-远未来", contractExpiry: plusDays(200), status: "在职" })!;

  createAccount({ username: HR, password: PW, systemRole: "HR" });
  createAccount({ username: STAFF, password: PW, systemRole: "EMPLOYEE" });
  createAccount({ username: OFF, password: PW, systemRole: "ADMIN" });
  db.prepare("UPDATE accounts SET enabled = 0 WHERE username = ?").run(OFF);

  const app = express();
  app.use("/api/reminders", remindersRouter);
  httpServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  apiBase = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/api/reminders`;
});

afterAll(async () => {
  const ids = [empSoon.id, empProbation.id, empResigned.id, empFar.id];
  for (const id of ids) {
    db.prepare("DELETE FROM todos WHERE targetId = ?").run(id);
    db.prepare("DELETE FROM notifications WHERE refKey LIKE ?").run(`%:${id}`);
  }
  for (const u of [HR, STAFF, OFF]) deleteAccount(u);
  for (const id of ids) deleteEmployee(id);
  await new Promise<void>((r) => httpServer.close(() => r()));
});

describe("collectReminderItems", () => {
  it("只收在职且落在窗口里的人", () => {
    const items = collectReminderItems(CONFIG);
    const byEmployee = new Map(items.map((i) => [i.employeeId, i]));
    expect(byEmployee.get(empSoon.id)?.kind).toBe("contract");
    expect(byEmployee.get(empSoon.id)?.daysLeft).toBeLessThanOrEqual(30);
    expect(byEmployee.get(empProbation.id)?.kind).toBe("probation");
    expect(byEmployee.has(empResigned.id)).toBe(false); // 离职不算
    expect(byEmployee.has(empFar.id)).toBe(false); // 200 天后，超出 30 天窗口
  });

  it("窗口调小到 5 天时，10 天后到期的合同就不再提醒", () => {
    const items = collectReminderItems({ ...CONFIG, contractExpiryDays: 5 });
    expect(items.some((i) => i.employeeId === empSoon.id && i.kind === "contract")).toBe(false);
  });
});

describe("收件人口径", () => {
  it("含启用中的 HR，不含普通员工，也不含被停用的管理员", () => {
    const recipients = listReminderRecipients();
    expect(recipients).toContain(HR);
    expect(recipients).not.toContain(STAFF);
    expect(recipients).not.toContain(OFF);
  });
});

describe("scanReminders", () => {
  it("只给 HR 生成待办与通知，重复扫描不再堆第二份", () => {
    const first = scanReminders(CONFIG);
    expect(first.recipients).toContain(HR);
    expect(first.items.some((i) => i.employeeId === empSoon.id)).toBe(true);
    expect(todosOf(HR)).toBeGreaterThan(0);
    expect(todosOf(STAFF)).toBe(0); // 关键：普通员工不再被写入全员提醒
    const hrTodos = todosOf(HR);

    const second = scanReminders(CONFIG);
    expect(second.created).toBe(0);
    expect(todosOf(HR)).toBe(hrTodos);
    expect(notificationsOf(HR, `contract:${empSoon.id}`)).toBe(1);
    expect(notificationsOf(HR, `probation:${empProbation.id}`)).toBe(1);
    // 收件人限定 HR+：普通员工一条也不该收到
    expect(notificationsOf(STAFF, `contract:${empSoon.id}`)).toBe(0);
  });

  it("配置读写落在 settings KV，形状异常的值会被收敛", () => {    const original = getReminderConfig();
    setReminderConfig({ contractExpiryDays: 45 });
    expect(getReminderConfig().contractExpiryDays).toBe(45);

    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('reminderConfig', '{"contractExpiryDays":"abc","probationConversionDays":99999}')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run();
    const sanitized = getReminderConfig();
    expect(sanitized.contractExpiryDays).toBe(30); // 非数字 → 回默认
    expect(sanitized.probationConversionDays).toBe(365); // 超上限 → 夹到 365

    setReminderConfig(original);
  });
});

describe("HTTP 层接线", () => {
  // 只调 service 函数的测试抓不到这类 bug：router 忘记挂 body parser 时，
  // PUT 的 req.body 是 undefined，zod 直接判 "expected object, received undefined"。
  it("PUT /config 能把阈值写进服务端，GET /config 读回来", async () => {
    const original = getReminderConfig();
    const res = await fetch(`${apiBase}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractExpiryDays: 21 }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, number>).contractExpiryDays).toBe(21);

    const read = (await fetch(`${apiBase}/config`).then((r) => r.json())) as Record<string, number>;
    expect(read.contractExpiryDays).toBe(21);
    expect(read.probationConversionDays).toBe(original.probationConversionDays);

    setReminderConfig(original);
  });

  it("GET /status 与 POST /scan 可用，且非法阈值被 400 挡下", async () => {
    const status = (await fetch(`${apiBase}/status`).then((r) => r.json())) as { lastScanAt: string | null };
    expect(status).toHaveProperty("lastScanAt");

    const bad = await fetch(`${apiBase}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractExpiryDays: 0 }),
    });
    expect(bad.status).toBe(400);

    const scanned = (await fetch(`${apiBase}/scan`, { method: "POST" }).then((r) => r.json())) as {
      recipients: string[];
    };
    expect(scanned.recipients).toContain(HR);
  });
});
