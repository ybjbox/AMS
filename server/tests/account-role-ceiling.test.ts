/**
 * 账号管理的角色天花板（批次 1 blocker）。
 *
 * 被治的那个洞：策略表和 requireRole 只看「调用者的秩够不够下限」，没人看「目标的秩是多少」，
 * 于是 ADMIN 对超管用户名调一次 reset-password 就能把口令改成自己知道的值，
 * 再以那个 SUPER_ADMIN 身份登录 —— 系统的授权模型整体被这一条路绕过。
 * 这里逐条钉住收口后的规则：**对别人的账号**，调用者的秩必须严格高于目标；
 * 只有超级管理员之间可以互管。自己的账号由各 handler 里原有的自锁保护管着。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用后即删，不留测试账号。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAccount,
  deleteAccount,
  getAccount,
  type SessionContext,
  type SystemRole,
} from "../authDb.ts";
import { authRouter } from "../authRouter.ts";

const PW = "Ceiling#Test2026-aa";
const NEW_PW = "Ceiling#Stolen2026-bb";

const SEEDED = ["ceil-super", "ceil-super2", "ceil-admin", "ceil-admin2", "ceil-hr", "ceil-emp"] as const;
const ALSO_CREATED = ["ceil-created-hr", "ceil-ghost"] as const;

let apiServer: Server;
let base = "";

beforeAll(async () => {
  createAccount({ username: "ceil-super", password: PW, systemRole: "SUPER_ADMIN" });
  createAccount({ username: "ceil-super2", password: PW, systemRole: "SUPER_ADMIN" });
  createAccount({ username: "ceil-admin", password: PW, systemRole: "ADMIN" });
  createAccount({ username: "ceil-admin2", password: PW, systemRole: "ADMIN" });
  createAccount({ username: "ceil-hr", password: PW, systemRole: "HR" });
  createAccount({ username: "ceil-emp", password: PW, systemRole: "EMPLOYEE" });

  const app = express();
  // 网关（authGate）不在本用例范围内：这里只注入身份，专测 handler 里的秩比较。
  app.use((req, _res, next) => {
    const role = (req.header("x-mock-role") ?? "ADMIN") as SystemRole;
    (req as { auth?: unknown }).auth = {
      username: req.header("x-mock-actor") ?? "ceil-admin",
      systemRole: role,
      employeeId: null,
      displayName: "天花板测试",
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
  for (const u of [...SEEDED, ...ALSO_CREATED]) deleteAccount(u);
  await new Promise<void>((r) => apiServer.close(() => r()));
});

function call(
  method: string,
  path: string,
  actor: { role: SystemRole; username?: string },
  body?: unknown
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-mock-role": actor.role,
      "x-mock-actor": actor.username ?? (actor.role === "SUPER_ADMIN" ? "ceil-super" : "ceil-admin"),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const hashOf = (username: string) => getAccount(username)?.passwordHash ?? "";

describe("重置口令 / 启停 / 删除：不得触碰秩 ≥ 自己的账号", () => {
  it("ADMIN 重置超管口令 → 403，且哈希一位都没变", async () => {
    const before = hashOf("ceil-super");
    const res = await call("POST", "/ceil-super/reset-password", { role: "ADMIN" }, { newPassword: NEW_PW });
    expect(res.status).toBe(403);
    expect(hashOf("ceil-super")).toBe(before);
  });

  it("ADMIN 停用超管 → 403，账号仍然启用", async () => {
    const res = await call("PUT", "/ceil-super", { role: "ADMIN" }, { enabled: false });
    expect(res.status).toBe(403);
    expect(getAccount("ceil-super")?.enabled).toBe(1);
  });

  it("ADMIN 把超管降权 → 403", async () => {
    const res = await call("PUT", "/ceil-super", { role: "ADMIN" }, { systemRole: "EMPLOYEE" });
    expect(res.status).toBe(403);
    expect(getAccount("ceil-super")?.systemRole).toBe("SUPER_ADMIN");
  });

  it("ADMIN 删除超管 → 403；ADMIN 踢同级管理员下线 → 403", async () => {
    expect((await call("DELETE", "/ceil-super", { role: "ADMIN" })).status).toBe(403);
    const peerKick = await call("POST", "/ceil-admin/revoke-sessions", { role: "ADMIN", username: "ceil-admin2" });
    expect(peerKick.status).toBe(403);
    expect(getAccount("ceil-super")).not.toBeNull();
  });

  it("另一个 ADMIN 重置同级 ADMIN 的口令 → 403（横向接管同样是接管）", async () => {
    const before = hashOf("ceil-admin");
    const res = await call(
      "POST",
      "/ceil-admin/reset-password",
      { role: "ADMIN", username: "ceil-admin2" },
      { newPassword: NEW_PW }
    );
    expect(res.status).toBe(403);
    expect(hashOf("ceil-admin")).toBe(before);
  });
});

describe("授予角色 / 创建账号：不得造出秩 ≥ 自己的账号", () => {
  it("ADMIN 创建 ADMIN → 403，创建 HR → 201", async () => {
    const peer = await call("POST", "", { role: "ADMIN" }, { username: "ceil-ghost", password: PW, systemRole: "ADMIN" });
    expect(peer.status).toBe(403);
    expect(getAccount("ceil-ghost")).toBeNull();

    const lower = await call("POST", "", { role: "ADMIN" }, { username: "ceil-created-hr", password: PW, systemRole: "HR" });
    expect(lower.status).toBe(201);
  });

  it("ADMIN 把手下 HR 提成与自己同级 → 403（否则造完就能随手重置接管）", async () => {
    const res = await call("PUT", "/ceil-hr", { role: "ADMIN" }, { systemRole: "ADMIN" });
    expect(res.status).toBe(403);
    expect(getAccount("ceil-hr")?.systemRole).toBe("HR");
  });

  it("超管可以授予超管，也可以随手管同级超管", async () => {
    const grant = await call("PUT", "/ceil-emp", { role: "SUPER_ADMIN" }, { systemRole: "SUPER_ADMIN" });
    expect(grant.status).toBe(200);
    expect(getAccount("ceil-emp")?.systemRole).toBe("SUPER_ADMIN");
    await call("PUT", "/ceil-emp", { role: "SUPER_ADMIN" }, { systemRole: "EMPLOYEE" });

    const reset = await call("POST", "/ceil-super2/reset-password", { role: "SUPER_ADMIN" }, { newPassword: NEW_PW });
    expect(reset.status).toBe(200);
  });
});

describe("低于自己的账号照常可管；自己的账号走自助", () => {
  it("ADMIN 改 HR 的显示名 → 200", async () => {
    const res = await call("PUT", "/ceil-hr", { role: "ADMIN" }, { displayName: "改过了" });
    expect(res.status).toBe(200);
    expect(getAccount("ceil-hr")?.displayName).toBe("改过了");
  });

  it("HR 角色调账号管理端点 → 403（策略表下限，与天花板无关）", async () => {
    const res = await call("PUT", "/ceil-emp", { role: "HR", username: "ceil-hr" }, { displayName: "不该生效" });
    expect(res.status).not.toBe(200);
    expect(getAccount("ceil-emp")?.displayName).not.toBe("不该生效");
  });

  it("改自己的显示名不受天花板影响", async () => {
    const res = await call("PUT", "/ceil-admin", { role: "ADMIN", username: "ceil-admin" }, { displayName: "我自己" });
    expect(res.status).toBe(200);
    expect(getAccount("ceil-admin")?.displayName).toBe("我自己");
  });

  it("目标不存在 → 404，而不是放行到一个不存在的账号", async () => {
    const res = await call("POST", "/ceil-ghost/reset-password", { role: "ADMIN" }, { newPassword: NEW_PW });
    expect(res.status).toBe(404);
  });
});
