/**
 * 员工↔账号绑定回归测试（第 2 批）：
 *  1. v10 迁移把存量重复绑定按「启用优先、其次最近修改」只留一条，并建部分唯一索引；
 *  2. 索引建好后同一员工无法再被第二个账号绑定；NULL/空串不受唯一性约束；
 *  3. 账号端点前置校验：绑定不存在的工号 400，绑定已被他人占用的工号 400（而不是撞索引变 500）。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用后即删，不留测试账号。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { createAccount, deleteAccount, getAccount } from "../authDb.ts";
import { ensureUniqueAccountEmployeeBinding, runMigrations } from "../migrate.ts";
import { authRouter } from "../authRouter.ts";
// 只为建表副作用（overtime_ledger 在 approvalsDb 模块加载时建）
import "../approvalsDb.ts";
import type { SessionContext } from "../authDb.ts";

const PW = "Bind#Test2026-aa";

let apiServer: Server;
let base = "";
let empA = { id: "", name: "" };
let empB = { id: "", name: "" };

beforeAll(async () => {
  runMigrations();
  empA = createEmployee({ name: "绑定测试甲" })!;
  empB = createEmployee({ name: "绑定测试乙" })!;

  const app = express();
  app.use((req, _res, next) => {
    (req as { auth?: unknown }).auth = {
      username: "bind-test-admin",
      systemRole: "ADMIN" as SessionContext["systemRole"],
      employeeId: null,
      displayName: "测试管理员",
      email: "",
      mustChangePassword: false,
    } satisfies SessionContext;
    next();
  });
  app.use("/api/auth", authRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/auth/accounts`;
});

afterAll(async () => {
  for (const u of ["dup-disabled", "dup-recent", "dup-older", "keep-null-a", "keep-null-b", "guard-create"]) {
    deleteAccount(u);
  }
  deleteEmployee(empA.id);
  deleteEmployee(empB.id);
  await new Promise<void>((r) => apiServer.close(() => r()));
});

function bindOf(username: string): string | null {
  return getAccount(username)?.employeeId ?? null;
}

describe("v10 唯一绑定迁移", () => {
  it("同一员工的重复绑定只保留启用中的那条，并建起部分唯一索引", () => {
    // 迁移可能已在本库建好索引（runMigrations 会跑 v10），先摘掉才能种出重复
    db.exec("DROP INDEX IF EXISTS idx_accounts_employeeId");
    createAccount({ username: "dup-older", password: PW, systemRole: "EMPLOYEE", employeeId: empA.id });
    createAccount({ username: "dup-disabled", password: PW, systemRole: "EMPLOYEE", employeeId: empA.id });
    createAccount({ username: "dup-recent", password: PW, systemRole: "EMPLOYEE", employeeId: empA.id });
    db.prepare("UPDATE accounts SET enabled = 0 WHERE username = 'dup-disabled'").run();
    db.prepare("UPDATE accounts SET updatedAt = '2020-01-01 00:00:00' WHERE username = 'dup-older'").run();

    ensureUniqueAccountEmployeeBinding();

    // 停用优先出局；两条启用里留最近修改的那条
    expect(bindOf("dup-disabled")).toBeNull();
    expect(bindOf("dup-older")).toBeNull();
    expect(bindOf("dup-recent")).toBe(empA.id);

    // 唯一性现在由索引兜住
    expect(() =>
      db
        .prepare("UPDATE accounts SET employeeId = ? WHERE username = 'dup-older'")
        .run(empA.id)
    ).toThrow(/UNIQUE|constraint/i);
    // 未绑定（NULL / 空串）不受唯一性影响
    createAccount({ username: "keep-null-a", password: PW, systemRole: "EMPLOYEE" });
    createAccount({ username: "keep-null-b", password: PW, systemRole: "EMPLOYEE" });
    expect(() => {
      db.prepare("UPDATE accounts SET employeeId = '' WHERE username = 'keep-null-b'").run();
    }).not.toThrow();

    // 幂等：再跑一次不报错、结果不变
    ensureUniqueAccountEmployeeBinding();
    expect(bindOf("dup-recent")).toBe(empA.id);
  });
});

describe("账号端点的绑定前置校验", () => {
  const post = (body: unknown) =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mock-role": "ADMIN" },
      body: JSON.stringify(body),
    });

  it("工号不存在 → 400，而不是撞索引变 500", async () => {
    const res = await post({ username: "guard-create", password: PW, employeeId: "EMPXXXX" });
    expect(res.status).toBe(400);
    expect(String(((await res.json()) as { error?: string }).error)).toContain("员工档案不存在");
    expect(getAccount("guard-create")).toBeNull();
  });

  it("工号已被他人占用 → 400，并指名现有账号", async () => {
    const res = await post({ username: "guard-create", password: PW, employeeId: empA.id });
    expect(res.status).toBe(400);
    const msg = String(((await res.json()) as { error?: string }).error ?? "");
    expect(msg).toContain("dup-recent");
  });

  it("换绑到已被占用的员工 → 400；改绑到空闲员工 → 200", async () => {
    createAccount({ username: "guard-create", password: PW, systemRole: "EMPLOYEE" });
    const taken = await fetch(`${base}/guard-create`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: empA.id }),
    });
    expect(taken.status).toBe(400);

    const free = await fetch(`${base}/guard-create`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: empB.id }),
    });
    expect(free.status).toBe(200);
    expect(bindOf("guard-create")).toBe(empB.id);
  });
});

describe("删除员工的连带清理（第 8 批）", () => {
  it("登录账号自动解绑，加班/调休台账行一并删除", () => {
    const emp = createEmployee({ name: "删除清理测试" })!;
    createAccount({ username: "unbind-on-delete", password: PW, systemRole: "EMPLOYEE", employeeId: emp.id });
    db
      .prepare("INSERT INTO overtime_ledger (employeeId, employeeName, hours, updatedAt) VALUES (?, ?, 8, datetime('now'))")
      .run(emp.id, emp.name);

    deleteEmployee(emp.id);

    // 账号还在（审计要能追到人），但不能带着一个已不存在的工号继续拥有领域动作
    expect(bindOf("unbind-on-delete")).toBeNull();
    const left = db.prepare("SELECT COUNT(*) AS c FROM overtime_ledger WHERE employeeId = ?").get(emp.id) as {
      c: number | bigint;
    };
    expect(Number(left.c)).toBe(0);

    deleteAccount("unbind-on-delete");
  });
});
