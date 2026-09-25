/**
 * 零测试路由的权限与数据面回归（批次 H）。
 *
 * 这三台 router 此前没有任何测试：审计、系统诊断、看板聚合。它们的共同风险不是"算错"，
 * 而是**门槛被无声放宽**（比如把 /system 从策略表里漏掉就会退化成默认读 = 全员可见），
 * 以及聚合接口悄悄夹进按人明细。所以断言集中在 401/403/405 与"响应里有没有身份字段"。
 *
 * 用真 authGate（不是 mock req.auth）：门槛本来就长在网关上，mock 就等于测自己想测的结论。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { authGate } from "../authMiddleware.ts";
import { createAccount, createSession, deleteAccount, revokeSession } from "../authDb.ts";
import { auditRouter } from "../auditRouter.ts";
import { systemRouter } from "../systemRouter.ts";
import { statsRouter } from "../statsRouter.ts";
import { writeAuditLog } from "../auditDb.ts";

const PW = "Gates#Test2026-aa";
const USERS = {
  admin: "qa-gates-admin",
  hr: "qa-gates-hr",
  emp: "qa-gates-emp",
} as const;

let server: Server;
let base = "";
const tokens: Record<keyof typeof USERS, string> = { admin: "", hr: "", emp: "" };

async function call(path: string, who: keyof typeof USERS | "anon", method = "GET") {
  const res = await fetch(base + path, {
    method,
    headers: who === "anon" ? {} : { Authorization: `Bearer ${tokens[who]}` },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* CSV 等非 JSON 响应 */
  }
  return { status: res.status, text, json: json as Record<string, unknown>, type: res.headers.get("content-type") ?? "" };
}

beforeAll(async () => {
  const app = express();
  app.use("/api", authGate);
  app.use("/api/audit-logs", auditRouter);
  app.use("/api/system", systemRouter);
  app.use("/api/stats", statsRouter);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  createAccount({ username: USERS.admin, password: PW, systemRole: "SUPER_ADMIN" } as never);
  createAccount({ username: USERS.hr, password: PW, systemRole: "HR" } as never);
  createAccount({ username: USERS.emp, password: PW, systemRole: "EMPLOYEE" } as never);
  tokens.admin = createSession(USERS.admin, "127.0.0.1", "vitest").token;
  tokens.hr = createSession(USERS.hr, "127.0.0.1", "vitest").token;
  tokens.emp = createSession(USERS.emp, "127.0.0.1", "vitest").token;
  writeAuditLog({ level: "INFO", action: "qa.batchH.seed", actor: USERS.admin, actorRole: "SUPER_ADMIN", detail: "regression seed" });
});

afterAll(async () => {
  for (const t of Object.values(tokens)) revokeSession(t);
  for (const u of Object.values(USERS)) {
    try {
      deleteAccount(u);
    } catch {
      /* 已不存在 */
    }
  }
  await new Promise<void>((r) => server.close(() => r()));
});

describe("审计日志：只有管理员可读，且任何角色都删不掉", () => {
  for (const path of ["/audit-logs", "/audit-logs/facets", "/audit-logs/export"]) {
    it(`未登录 ${path} → 401`, async () => {
      expect((await call(path, "anon")).status).toBe(401);
    });
    it(`员工与 HR ${path} → 403（审计含"谁改了谁的薪资"）`, async () => {
      expect((await call(path, "emp")).status).toBe(403);
      expect((await call(path, "hr")).status).toBe(403);
    });
  }

  it("管理员可读，且能读回刚写入的那条", async () => {
    const res = await call("/audit-logs?pageSize=50", "admin");
    expect(res.status).toBe(200);
    const rows = (res.json.items ?? res.json.logs ?? res.json) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
    expect(JSON.stringify(rows)).toContain("qa.batchH.seed");
  });

  it("CSV 导出是真 CSV（不是 JSON 套壳），管理员限定", async () => {
    const res = await call("/audit-logs/export", "admin");
    expect(res.status).toBe(200);
    expect(res.type).toContain("text/csv");
    expect(res.text).toContain("qa.batchH.seed");
  });

  it("删除：管理员拿到 405 + 原因；HR 连语义都问不到（网关先 403，不落 404）", async () => {
    const asAdmin = await call("/audit-logs/1", "admin", "DELETE");
    expect(asAdmin.status).toBe(405);
    expect(asAdmin.json.code).toBe("AUDIT_APPEND_ONLY");
    // 无权角色不应被告知"这张表拒绝删除"还是"没有这条路由"——403 就够了
    expect((await call("/audit-logs/1", "hr", "DELETE")).status).toBe(403);
    expect((await call("/audit-logs/1", "emp", "DELETE")).status).toBe(403);
  });
});

describe("系统诊断：进程与环境信息只给管理员", () => {
  it("未登录 401 / 员工 403 / HR 也 403", async () => {
    expect((await call("/system/diagnostics", "anon")).status).toBe(401);
    expect((await call("/system/diagnostics", "emp")).status).toBe(403);
    expect((await call("/system/diagnostics", "hr")).status).toBe(403);
  });

  it("管理员能读，且回的是运维字段", async () => {
    const res = await call("/system/diagnostics", "admin");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.json)).toMatch(/uptime|memory|version/i);
  });
});

describe("看板聚合：员工可读，但只能拿到聚合", () => {
  // /stats 不在策略表里 ⇒ 默认读 = EMPLOYEE。这是有意的：控制台对员工开放并要画这些图。
  // 真风险是"哪天有人往聚合里塞按人明细"，所以钉的是字段集合而不是状态码而已。
  for (const path of ["/stats/workforce", "/stats/attendance"]) {
    it(`${path} 员工可读且响应里没有任何按人身份字段`, async () => {
      const res = await call(path, "emp");
      expect(res.status).toBe(200);
      const blob = JSON.stringify(res.json);
      for (const leak of ["employeeId", "employeeName", "idCard", "phone", "passwordHash"]) {
        expect(blob).not.toContain(leak);
      }
    });
  }

  it("未登录仍然 401（聚合也不是公开信息）", async () => {
    expect((await call("/stats/workforce", "anon")).status).toBe(401);
  });
});
