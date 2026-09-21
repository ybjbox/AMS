/**
 * 业务单归档（员工档案留痕）回归测试：
 *  1. 读写边界与合同信息同口径 —— 本人或 HR 及以上，越权 403，员工不存在 404；
 *  2. 归属员工以库内记录为准（employeeName 由服务端回填，不接受前端传入）；
 *  3. 列表按归档时间新→旧；
 *  4. 删除员工时归档一并清理（business_forms 无外键，靠显式 DELETE）。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test，与开发库完全隔离。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { runMigrations } from "../migrate.ts";
import { createBusinessForm, listBusinessForms } from "../businessFormsDb.ts";
import { businessFormRouter } from "../businessFormRouter.ts";
import type { SessionContext } from "../authDb.ts";

let app: express.Express;
let apiServer: Server;
let base = "";
/** 种子库里的任意一个真实员工，用作「他人」 */
let other = { id: "", name: "" };

beforeAll(async () => {
  runMigrations();
  other = db.prepare("SELECT id, name FROM employees LIMIT 1").get() as typeof other;
  app = express();
  // 不走会话中间件：用请求头注入角色与 employeeId，模拟不同登录者
  app.use((req, _res, next) => {
    const role = (req.header("x-mock-role") ?? "EMPLOYEE") as SessionContext["systemRole"];
    (req as { auth?: unknown }).auth = {
      username: `mock-${role.toLowerCase()}`,
      systemRole: role,
      employeeId: req.header("x-mock-employee-id") ?? null,
      displayName: "mock",
      email: "",
      mustChangePassword: false,
    } satisfies SessionContext;
    next();
  });
  app.use("/api/form", businessFormRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/form/records`;
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const RECORD = {
  kind: "condolence" as const,
  kindLabel: "亲属逝世慰问金",
  department: "集团办公室",
  relation: "父亲",
  date: "2026-09-20",
  amount: 501,
  body: "员工父亲过世，按制度申领慰问金 501 元。",
};

describe("POST /api/form/records", () => {
  it("HR 可为任意员工归档，员工姓名取自库内记录", async () => {
    const r = await post(
      { ...RECORD, employeeId: other.id, employeeName: "伪造名字" },
      { "x-mock-role": "HR" }
    );
    expect(r.status).toBe(201);
    const j = (await r.json()) as { employeeId: string; employeeName: string; operator: string };
    expect(j.employeeId).toBe(other.id);
    expect(j.employeeName).toBe(other.name);
    expect(j.operator).toBe("mock-hr");
  });

  it("EMPLOYEE 只能给本人归档；给他人归档 403", async () => {
    const mine = await post({ ...RECORD, employeeId: other.id }, { "x-mock-employee-id": other.id });
    expect(mine.status).toBe(201);

    const others = await post({ ...RECORD, employeeId: other.id }, { "x-mock-employee-id": "EMP9999" });
    expect(others.status).toBe(403);
  });

  it("员工不存在 404；缺正文 / 日期格式错 400", async () => {
    const missing = await post({ ...RECORD, employeeId: "EMPXXXX" }, { "x-mock-role": "HR" });
    expect(missing.status).toBe(404);

    const noBody = await post({ ...RECORD, body: "  " }, { "x-mock-role": "HR" });
    expect(noBody.status).toBe(400);

    const badDate = await post(
      { ...RECORD, employeeId: other.id, date: "2026/09/20" },
      { "x-mock-role": "HR" }
    );
    expect(badDate.status).toBe(400);
  });
});

describe("GET /api/form/records", () => {
  it("HR 可读；EMPLOYEE 读他人 403、读本人 200；缺 employeeId 400", async () => {
    const asHr = await fetch(`${base}?employeeId=${other.id}`, { headers: { "x-mock-role": "HR" } });
    expect(asHr.status).toBe(200);
    const rows = (await asHr.json()) as Array<{ employeeId: string; createdAt: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.employeeId === other.id)).toBe(true);

    const asSelf = await fetch(`${base}?employeeId=${other.id}`, {
      headers: { "x-mock-employee-id": other.id },
    });
    expect(asSelf.status).toBe(200);

    const asOther = await fetch(`${base}?employeeId=${other.id}`, {
      headers: { "x-mock-employee-id": "EMP9999" },
    });
    expect(asOther.status).toBe(403);

    const noId = await fetch(base, { headers: { "x-mock-role": "HR" } });
    expect(noId.status).toBe(400);
  });
});

describe("数据层", () => {
  it("同一员工的归档按新→旧排列，删除员工时一并清理", () => {
    const emp = createEmployee({ name: "业务单归档测试员" })!;
    createBusinessForm({ ...RECORD, employeeId: emp.id, employeeName: emp.name }, "ops-a");
    const newer = createBusinessForm(
      {
        ...RECORD,
        employeeId: emp.id,
        employeeName: emp.name,
        kind: "wedding",
        kindLabel: "员工结婚贺喜红包",
      },
      "ops-b"
    );
    const rows = listBusinessForms(emp.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(newer.id);
    expect(rows.map((r) => r.kind)).toEqual(["wedding", "condolence"]);
    expect(rows[1].employeeName).toBe(emp.name);

    deleteEmployee(emp.id);
    expect(listBusinessForms(emp.id)).toEqual([]);
  });
});
