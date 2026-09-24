/**
 * 删员工的"账号面"与连带清理的失败可见性（批次 D）。
 *
 * D1：db.ts 以前把所有异常都当"表还没建"吞掉，真实写失败（缺列、锁）会变成
 *     「档案改了但子表没改」「员工删了但台账还在」的静默半截状态。现在只容忍 no such table。
 * D2：删员工要连带停用 + 吊销其绑定账号（与离职流程同口径）；路由层挡下"删跟自己绑定的档案"。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。所有改坏的表结构都在 finally 里还原。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createEmployee, deleteEmployee, updateEmployee, getEmployee, db } from "../db.ts";
import { createAccount, createSession, deleteAccount, getAccount } from "../authDb.ts";
import { employeesRouter } from "../employeesRouter.ts";
// 建表副作用：business_forms 由 businessFormsDb 在模块加载时建
import "../businessFormsDb.ts";
import type { SessionContext } from "../authDb.ts";

const PW = "DelAcct#Test2026-aa";

let apiServer: Server;
let base = "";
const accounts: string[] = [];
const employees: string[] = [];

function newEmployee(name: string) {
  const emp = createEmployee({ name })!;
  employees.push(emp.id);
  return emp;
}
function newAccount(username: string, employeeId: string | null) {
  createAccount({ username, password: PW, systemRole: "HR", employeeId } as never);
  accounts.push(username);
  return getAccount(username)!;
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const username = String(req.header("x-mock-user") ?? "del-acct-admin");
    req.auth = {
      username,
      systemRole: "ADMIN",
      employeeId: getAccount(username)?.employeeId ?? null,
      displayName: username,
      email: "",
      mustChangePassword: false,
    } as unknown as SessionContext;
    next();
  });
  app.use("/api/users", employeesRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/users`;
});

afterAll(async () => {
  for (const u of accounts) deleteAccount(u);
  for (const id of employees) {
    try {
      deleteEmployee(id);
    } catch {
      db.prepare("DELETE FROM employees WHERE id = ?").run(id);
    }
  }
  await new Promise<void>((r) => apiServer.close(() => r()));
});

/** 把某张表的某一列临时改名，制造"真实写失败"（不是表不存在），用完必然还原 */
function breakColumn(table: string, column: string): () => void {
  db.prepare(`ALTER TABLE ${table} RENAME COLUMN ${column} TO ${column}_broken`).run();
  return () => db.prepare(`ALTER TABLE ${table} RENAME COLUMN ${column}_broken TO ${column}`).run();
}

describe("D2 删员工连带停用账号", () => {
  it("绑定账号被停用、解绑，会话被吊销", () => {
    const emp = newEmployee("删档测试·有账号");
    const acct = newAccount("del-acct-bound", emp.id);
    createSession(acct.username);
    expect(getAccount(acct.username)!.enabled).toBe(1);

    expect(deleteEmployee(emp.id)).toBe(true);

    const after = getAccount(acct.username)!;
    expect(after.employeeId ?? "").toBe("");
    expect(after.enabled).toBe(0);
    expect(
      db.prepare("SELECT COUNT(*) c FROM sessions WHERE username = ?").get(acct.username)
    ).toEqual({ c: 0 });
    // 账号本身保留（审计要能追到人）
    expect(after.username).toBe(acct.username);
  });

  it("路由挡下「删除与自己账号绑定的档案」（否则等于把自己停用）", async () => {
    const emp = newEmployee("删档测试·自绑");
    const acct = newAccount("del-acct-self", emp.id);
    const res = await fetch(`${base}/${emp.id}`, { method: "DELETE", headers: { "x-mock-user": acct.username } });
    expect(res.status).toBe(400);
    expect(String((await res.json()).error)).toMatch(/停用你自己的账号/u);
    // 没删掉：档案还在
    expect(getEmployee(emp.id)).toBeTruthy();

    const other = await fetch(`${base}/${emp.id}`, { method: "DELETE", headers: { "x-mock-user": "del-acct-admin" } });
    expect(other.status).toBe(200);
    expect(getEmployee(emp.id)).toBeFalsy();
  });
});

describe("D1 连带清理的真实失败不再被吞", () => {
  it("改名时快照表写失败 → 整个更新回滚并抛错（以前静默返回成功）", () => {
    const emp = newEmployee("吞错测试·改名");
    const restore = breakColumn("business_forms", "employeeName");
    try {
      expect(() => updateEmployee(emp.id, { name: "吞错测试·改名后" })).toThrow();
      expect(getEmployee(emp.id)!.name).toBe("吞错测试·改名"); // 事务整体回滚
    } finally {
      restore();
    }
    // 修好后同样的改名应当成功
    expect(updateEmployee(emp.id, { name: "吞错测试·改名后" })!.name).toBe("吞错测试·改名后");
  });

  it("删员工时台账写失败 → 抛错且员工档案仍在（不留半截删除）", () => {
    const emp = newEmployee("吞错测试·删除");
    // 断掉 DELETE 语句真正用到的那一列（employeeName 对 DELETE 无影响，改它不会失败）
    const restore = breakColumn("contract_renewals", "employeeId");
    try {
      expect(() => deleteEmployee(emp.id)).toThrow(/no such column/i);
      expect(getEmployee(emp.id)).toBeTruthy();
    } finally {
      restore();
    }
    expect(deleteEmployee(emp.id)).toBe(true);
    expect(getEmployee(emp.id)).toBeFalsy();
  });

  it("表不存在仍然只是跳过（只 import db.ts 的精简进程不能被打断）", () => {
    const emp = newEmployee("吞错测试·缺表");
    db.prepare("ALTER TABLE anomalies RENAME TO anomalies_hidden").run();
    try {
      expect(() => updateEmployee(emp.id, { name: "吞错测试·缺表后" })).not.toThrow();
      expect(getEmployee(emp.id)!.name).toBe("吞错测试·缺表后");
    } finally {
      db.prepare("ALTER TABLE anomalies_hidden RENAME TO anomalies").run();
    }
  });
});
