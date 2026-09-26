/**
 * 考勤写路径语义回归测试（第 1 批修复）：
 *  1. PUT /records 传空数组必须被拒 —— 它此前等于「一键清空全库打卡记录」；
 *  2. 整表清空只在 ADMIN 下成立（HR 拿到 403，且不产生任何删除）；
 *  3. PUT /schedules 是 upsert-only（删不掉行），删除必须走 DELETE /schedules/:employeeId。
 *  4. PUT /records 同样是 upsert-only（批次 1：默认写策略只有 HR+，先 DELETE 全表等于
 *     让任何 HR 用一行请求清空全库打卡记录）。
 *
 * 刻意不测「ADMIN 真的清空全库」：那会破坏 data-test 里其他用例依赖的考勤数据。
 * 运行环境：vitest server project，DATA_DIR=data-test。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { listSchedules } from "../attendanceDb.ts";
import { attendanceRouter } from "../attendanceRouter.ts";
import type { SessionContext } from "../authDb.ts";

let apiServer: Server;
let base = "";
let empA = { id: "", name: "" };
let empB = { id: "", name: "" };

beforeAll(async () => {
  empA = createEmployee({ name: "考勤写入测试甲" })!;
  empB = createEmployee({ name: "考勤写入测试乙" })!;
  const app = express();
  app.use((req, _res, next) => {
    (req as { auth?: unknown }).auth = {
      username: `mock-${(req.header("x-mock-role") ?? "HR").toLowerCase()}`,
      systemRole: (req.header("x-mock-role") ?? "HR") as SessionContext["systemRole"],
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

afterAll(async () => {
  // 显式清打卡行：老库上 punch_records 未必有 FK CASCADE（同一张表两套建表定义的历史问题）
  db.prepare("DELETE FROM punch_records WHERE employeeId IN (?, ?)").run(empA.id, empB.id);
  db.prepare("DELETE FROM schedules WHERE employeeId IN (?, ?)").run(empA.id, empB.id);
  deleteEmployee(empA.id);
  deleteEmployee(empB.id);
  await new Promise<void>((r) => apiServer.close(() => r()));
});

const schedule = (employeeId: string, employeeName: string) => ({
  employeeId,
  employeeName,
  shiftIds: ["shift-1"],
});

describe("PUT /records 的空数组护栏", () => {
  it("空数组被拒，且已有记录不受影响", async () => {
    // 作用域限定在本用例自建的员工上：data-test 由多个测试文件共用，全局计数会互相干扰
    const scoped = `${base}/records?employeeId=${encodeURIComponent(empA.id)}&page=1&pageSize=1`;
    const seed = await fetch(`${base}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ employeeId: empA.id, employeeName: empA.name, date: "2026-09-19", time: "09:00:00" }),
    });
    expect(seed.status).toBe(201);

    const before = (await fetch(scoped).then((r) => r.json())) as { total: number };
    const res = await fetch(`${base}/records`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ records: [] }),
    });
    expect(res.status).toBe(400);
    const msg = String(((await res.json()) as { error?: string }).error ?? "");
    expect(msg).toContain("导入清单为空");

    const after = (await fetch(scoped).then((r) => r.json())) as { total: number };
    expect(after.total).toBe(before.total);
    expect(after.total).toBe(1);
  });

  it("非数组仍然是 400；清空全库需 ADMIN", async () => {
    const notArray = await fetch(`${base}/records`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ records: "all" }),
    });
    expect(notArray.status).toBe(400);

    const asHr = await fetch(`${base}/records`, {
      method: "DELETE",
      headers: { "x-mock-role": "HR" },
    });
    expect(asHr.status).toBe(403);
  });
});

describe("PUT /records 的 upsert-only 语义（批次 1）", () => {
  it("只传一行不会清空该员工其余打卡：破坏性清空只属于 DELETE /records（仅 ADMIN）", async () => {
    const seed = [
      { date: "2026-09-20", time: "09:00:00" },
      { date: "2026-09-20", time: "18:00:00" },
    ];
    for (const p of seed) {
      const res = await fetch(`${base}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
        body: JSON.stringify({ employeeId: empB.id, employeeName: empB.name, ...p }),
      });
      expect(res.status).toBe(201);
    }

    const scoped = `${base}/records?employeeId=${encodeURIComponent(empB.id)}&page=1&pageSize=20`;
    const before = (await fetch(scoped).then((r) => r.json())) as { total: number; items: { date: string }[] };
    expect(before.total).toBe(2);

    // 旧实现这里是 DELETE FROM punch_records 再整体插入：一行请求 = 全库清零。
    const put = await fetch(`${base}/records`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ records: [{ employeeId: empB.id, employeeName: empB.name, date: "2026-09-21", time: "09:00:00" }] }),
    });
    expect(put.status).toBe(200);

    const after = (await fetch(scoped).then((r) => r.json())) as { total: number; items: { date: string }[] };
    expect(after.total).toBe(3);
    expect(after.items.map((r) => r.date)).toContain("2026-09-20");
    expect(after.items.map((r) => r.date)).toContain("2026-09-21");
  });

  it("同一分钟重复提交是幂等的（唯一键 DO NOTHING，不造出双份卡）", async () => {
    const row = { employeeId: empB.id, employeeName: empB.name, date: "2026-09-22", time: "09:00:00" };
    const scoped = `${base}/records?employeeId=${encodeURIComponent(empB.id)}&page=1&pageSize=20`;
    const before = (await fetch(scoped).then((r) => r.json())) as { total: number };

    await fetch(`${base}/records`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ records: [row, row] }),
    });
    const after = (await fetch(scoped).then((r) => r.json())) as { total: number };
    expect(after.total).toBe(before.total + 1);
  });
});

describe("排班删除语义", () => {
  it("PUT /schedules 是 upsert-only：少传一行不会删掉它", async () => {
    const two = await fetch(`${base}/schedules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ schedules: [schedule(empA.id, empA.name), schedule(empB.id, empB.name)] }),
    });
    expect(two.status).toBe(200);

    await fetch(`${base}/schedules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-mock-role": "HR" },
      body: JSON.stringify({ schedules: [schedule(empA.id, empA.name)] }),
    });
    const ids = listSchedules().map((s) => s.employeeId);
    expect(ids).toContain(empA.id);
    expect(ids).toContain(empB.id); // 未提及的行仍在（这正是前端此前误用 PUT 删除的原因）
  });

  it("DELETE /schedules/:employeeId 真删；整表清空需 ADMIN", async () => {
    const del = await fetch(`${base}/schedules/${encodeURIComponent(empB.id)}`, {
      method: "DELETE",
      headers: { "x-mock-role": "HR" },
    });
    expect(del.status).toBe(200);
    expect(listSchedules().map((s) => s.employeeId)).not.toContain(empB.id);

    const missing = await fetch(`${base}/schedules/${encodeURIComponent(empB.id)}`, {
      method: "DELETE",
      headers: { "x-mock-role": "HR" },
    });
    expect(missing.status).toBe(404);

    const clearAsHr = await fetch(`${base}/schedules`, { method: "DELETE", headers: { "x-mock-role": "HR" } });
    expect(clearAsHr.status).toBe(403);
  });
});
