/**
 * 组织架构入参 id 唯一性回归（第 12 批）。
 *
 * 前端曾给新增节点用 Date.now().toString() 造 id：同一毫秒建两个部门就撞成同一个主键，
 * 部门侧 upsert 静默覆盖第二条、职位侧裸 INSERT 直接 UNIQUE 崩成 500 —— 两种都是
 * 「用户以为存下了」。现在写库前先拒（400 + 中文原因），且失败不留下半棵修改过的树。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DeptDataError, listDepartmentsTree, listRoles, replaceDepartmentsTree } from "../departmentsDb.ts";
import { departmentsRouter } from "../departmentsRouter.ts";
import { runMigrations } from "../migrate.ts";

type Tree = ReturnType<typeof listDepartmentsTree>;

let tree: Tree = [];
let roles: ReturnType<typeof listRoles> = [];
let httpServer: Server;
let base = "";

const dupNode = (name: string, id: string) => ({ id, name, priority: 5 });

beforeAll(async () => {
  runMigrations();
  // 用例只在真树上「加节点再还原」，不做任何删除，避免动到 data-test 里的员工外键
  tree = listDepartmentsTree();
  roles = listRoles();

  const app = express();
  app.use("/api/departments", departmentsRouter);
  httpServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/api/departments`;
});

afterAll(() => {
  replaceDepartmentsTree(tree as never);
});

describe("写库前校验", () => {
  it("同一棵树里重复 id 被拒，且原树不动", () => {
    const before = JSON.stringify(listDepartmentsTree());
    const payload = [...tree, dupNode("重复甲", "same-id"), dupNode("重复乙", "same-id")];

    expect(() => replaceDepartmentsTree(payload as never)).toThrow(DeptDataError);
    expect(() => replaceDepartmentsTree(payload as never)).toThrow(/重复 id/);
    expect(JSON.stringify(listDepartmentsTree())).toBe(before);
  });

  it("缺 id 的新节点被拒（不能让服务端替它猜一个）", () => {
    const before = JSON.stringify(listDepartmentsTree());
    expect(() =>
      replaceDepartmentsTree([...tree, { name: "没 id 的部门", priority: 1 } as never])
    ).toThrow(/缺少 id/);
    expect(JSON.stringify(listDepartmentsTree())).toBe(before);
  });

  it("uuid id 的新节点可以正常写入并读回", () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const payload = [...tree, dupNode("同毫秒甲", a), dupNode("同毫秒乙", b)];

    const after = replaceDepartmentsTree(payload as never);
    const names = JSON.stringify(after);
    expect(names).toContain("同毫秒甲");
    expect(names).toContain("同毫秒乙");

    replaceDepartmentsTree(tree as never); // 还原
  });
});

describe("HTTP 层", () => {
  const put = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("重复 id 的整树提交返回 400 + 中文原因，不是 500", async () => {
    const res = await put("/tree", {
      departments: [...tree, dupNode("撞车甲", "x-1"), dupNode("撞车乙", "x-1")],
    });
    expect(res.status).toBe(400);
    expect(String(((await res.json()) as { error?: string }).error)).toContain("重复 id");
    expect(JSON.stringify(listDepartmentsTree())).toContain("集团总部");
    expect(JSON.stringify(listDepartmentsTree())).not.toContain("撞车甲");
  });

  it("职位重复 id 同样 400，职位表不动", async () => {
    const res = await put("/roles", {
      roles: [...roles, { id: "r-dup", name: "重复职位甲", departmentId: "4" }, { id: "r-dup", name: "重复职位乙", departmentId: "4" }],
    });
    expect(res.status).toBe(400);
    expect(listRoles().some((r) => r.name.startsWith("重复职位"))).toBe(false);
  });
});
