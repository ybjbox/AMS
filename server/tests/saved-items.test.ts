/**
 * 用户留存条目（座位方案 / 打印参数）回归 —— 第 9 批。
 *
 * 关注三件事：同名覆盖而不是堆重复行、按 owner 严格隔离（别人的 id 删不掉也读不到）、
 * 以及 HTTP 接线（新 router 必须带一条真起 express + fetch 的用例，见第 3/5 批教训）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  MAX_PAYLOAD_CHARS,
  deleteSavedItem,
  listSavedItems,
  upsertSavedItem,
} from "../savedItemsDb.ts";
import { savedItemsRouter } from "../savedItemsRouter.ts";
import type { SessionContext } from "../authDb.ts";

const OWNED: string[] = [];
let base = "";
let httpServer: Server;

function session(username: string, systemRole: SessionContext["systemRole"] = "EMPLOYEE") {
  return {
    username,
    systemRole,
    employeeId: null,
    displayName: username,
    email: "",
    mustChangePassword: false,
  } satisfies SessionContext;
}

let auth: SessionContext = session("owner-a");

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as { auth?: SessionContext }).auth = auth;
    next();
  });
  app.use("/api/saved-items", savedItemsRouter);
  httpServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/api/saved-items`;
});

afterAll(async () => {
  for (const id of OWNED) deleteSavedItem(id, "owner-a");
  await new Promise<void>((r) => httpServer.close(() => r()));
});

describe("读写与归属", () => {
  it("同名再存是覆盖，且列表按最近更新排序", () => {
    const first = upsertSavedItem({
      kind: "seating-plan",
      name: "年会第一版",
      owner: "owner-a",
      payload: { version: 1, tables: [{ number: 1, memberIds: ["EMP0001"] }] },
    });
    OWNED.push(first.id);
    const second = upsertSavedItem({
      kind: "seating-plan",
      name: "年会第一版",
      owner: "owner-a",
      payload: { version: 1, tables: [] },
    });
    expect(second.id).toBe(first.id);

    upsertSavedItem({ kind: "seating-plan", name: "婚宴", owner: "owner-a", payload: { version: 1 } });
    const rows = listSavedItems("seating-plan", "owner-a");
    expect(rows.map((r) => r.name)).toContain("婚宴");
    expect(rows.filter((r) => r.name === "年会第一版")).toHaveLength(1);
    expect(rows[0].name).toBe("婚宴");
    for (const r of rows) if (!OWNED.includes(r.id)) OWNED.push(r.id);
  });

  it("按 kind 取，只拿到自己该拿的那一份", () => {
    upsertSavedItem({ kind: "seating-prefs", name: "__self__", owner: "owner-a", payload: { cardTitle: "席位卡" } });
    const prefs = listSavedItems("seating-prefs", "owner-a");
    expect(prefs).toHaveLength(1);
    expect((prefs[0].payload as { cardTitle: string }).cardTitle).toBe("席位卡");
    OWNED.push(prefs[0].id);
  });

  it("别人的条目既列不出也删不掉", () => {
    const mine = upsertSavedItem({ kind: "seating-plan", name: "私有方案", owner: "owner-a", payload: {} });
    OWNED.push(mine.id);

    expect(listSavedItems("seating-plan", "owner-b").find((r) => r.id === mine.id)).toBeUndefined();
    expect(deleteSavedItem(mine.id, "owner-b")).toBe(false);
    expect(deleteSavedItem(mine.id, "owner-a")).toBe(true);
  });

  it("空名与超大 payload 直接拒", () => {
    expect(() => upsertSavedItem({ kind: "seating-plan", name: "   ", owner: "owner-a", payload: {} })).toThrow(
      /名称/
    );
    expect(() =>
      upsertSavedItem({
        kind: "seating-plan",
        name: "过大",
        owner: "owner-a",
        payload: "x".repeat(MAX_PAYLOAD_CHARS + 10),
      })
    ).toThrow(/过大/);
  });
});

describe("HTTP 层接线", () => {
  const post = (body: unknown) =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("POST 保存 → GET 列表 → DELETE 删除，全链路可用", async () => {
    const created = await post({ kind: "namecards-prefs", name: "__self__", payload: { paperSize: "A5" } });
    expect(created.status).toBe(201);
    const item = (await created.json()) as { id: string; name: string };
    OWNED.push(item.id);

    const list = (await (await fetch(`${base}?kind=namecards-prefs`)).json()) as { name: string }[];
    expect(list.map((r) => r.name)).toContain("__self__");

    const gone = await fetch(`${base}/${item.id}`, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect((await fetch(`${base}/${item.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("未知 kind 与缺名都被 400 挡下，不写库", async () => {
    auth = session("owner-a");
    expect((await post({ kind: "evil-kind", name: "x", payload: {} })).status).toBe(400);
    expect((await post({ kind: "seating-plan", name: "", payload: {} })).status).toBe(400);
    expect(listSavedItems("seating-plan", "owner-a").some((r) => r.name === "")).toBe(false);
  });

  it("GET ?kind=未知 返回 400", async () => {
    expect((await fetch(`${base}?kind=nope`)).status).toBe(400);
  });
});
