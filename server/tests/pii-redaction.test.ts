/**
 * 员工 PII 读侧裁剪回归测试（第二梯队 #12 + 第 13 批的合同/社保收权）：
 * authGate 默认「登录即可读」曾让任意账号通过 GET /api/users 拖走全员
 * 身份证 / 住址 / 手机号 / 合同起止。现在由 employeesRouter 按角色裁剪。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { canViewPii, redactPii } from "../employeesRouter.ts";
import { employeesRouter } from "../employeesRouter.ts";
import { runMigrations } from "../migrate.ts";
import type { SessionContext } from "../authDb.ts";

type EmployeeView = Record<string, unknown> & {
  id: string;
  name: string;
  department: string;
  idCard: string;
  contractExpiry: string;
  contractSignDate: string;
  daysToExpiry: number;
  hasSocialSecurity: boolean;
};

function session(systemRole: SessionContext["systemRole"], employeeId: string | null = null) {
  return {
    username: "u",
    systemRole,
    employeeId,
    displayName: "u",
    email: "",
    mustChangePassword: false,
  } satisfies SessionContext;
}

describe("canViewPii：角色门槛", () => {
  it("HR / ADMIN / SUPER_ADMIN 全量；EMPLOYEE 无权；未登录无权", () => {
    expect(canViewPii(session("HR"))).toBe(true);
    expect(canViewPii(session("ADMIN"))).toBe(true);
    expect(canViewPii(session("SUPER_ADMIN"))).toBe(true);
    expect(canViewPii(session("EMPLOYEE"))).toBe(false);
    expect(canViewPii(undefined)).toBe(false);
  });

  it("本人豁免：EMPLOYEE 读自己的记录不裁剪", () => {
    expect(canViewPii(session("EMPLOYEE", "EMP0001"), "EMP0001")).toBe(true);
    expect(canViewPii(session("EMPLOYEE", "EMP0001"), "EMP0002")).toBe(false);
    // 列表接口没有 targetId，不给豁免通道
    expect(canViewPii(session("EMPLOYEE", "EMP0001"))).toBe(false);
  });
});

describe("redactPii：字段裁剪结果", () => {
  const full = {
    id: "EMP0002",
    name: "张三",
    idCard: "110101199003074610",
    phone: "13800001234",
    registeredAddress: "北京市东城区某街道1号",
    currentAddress: "上海市徐汇区某路2号",
    department: "技术部",
    status: "在职",
    employmentType: "全职",
    contractYears: 3,
    contractSignDate: "2025-04-01",
    contractExpiry: "2028-03-31",
    daysToExpiry: 556,
    hasSocialSecurity: true,
  };

  it("身份证/住址清空，手机号掩码；组织可见字段（姓名/部门/状态/用工形式）保留", () => {
    const out = redactPii(full as never);
    expect(out.idCard).toBe("");
    expect(out.registeredAddress).toBe("");
    expect(out.currentAddress).toBe("");
    expect(out.phone).toBe("138****1234");
    expect(out.name).toBe("张三");
    expect(out.department).toBe("技术部");
    expect(out.status).toBe("在职");
    expect(out.employmentType).toBe("全职");
  });

  it("合同与社保一并清空（第 13 批：与续签台账同一口径，不再是绕过入口）", () => {
    const out = redactPii(full as never);
    expect(out.contractYears).toBe(0);
    expect(out.contractSignDate).toBe("");
    expect(out.contractExpiry).toBe("");
    expect(out.daysToExpiry).toBe(0);
    expect(out.hasSocialSecurity).toBe(false);
  });

  it("短手机号不泄露残余位数；空号保持为空", () => {
    expect(redactPii({ phone: "12345" } as never).phone).toBe("****");
    expect(redactPii({ phone: "" } as never).phone).toBe("");
  });
});

describe("HTTP 层：不同角色的实际响应", () => {
  // 只测纯函数抓不到「列表接口忘了走 redactPii」这类接线问题（第 3/5 批的同类教训）
  let base = "";
  let httpServer: import("node:http").Server;
  let authRef: SessionContext | undefined;

  beforeAll(async () => {
    runMigrations();
    const app = express();
    app.use((req, _res, next) => {
      (req as { auth?: SessionContext }).auth = authRef;
      next();
    });
    app.use("/api/users", employeesRouter);
    httpServer = await new Promise<import("node:http").Server>((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/api/users`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => httpServer.close(() => r()));
  });

  const list = async (as: SessionContext | undefined) => {
    authRef = as;
    const res = await fetch(`${base}?page=1&pageSize=5`);
    return (await res.json()) as { items: EmployeeView[] };
  };

  it("HR 能看到合同起止与社保；EMPLOYEE 全部为空白", async () => {
    const hr = await list(session("HR", null));
    const staff = await list(session("EMPLOYEE", null));
    const sample = hr.items.find((u) => u.contractExpiry) ?? hr.items[0];
    const twin = staff.items.find((u) => u.id === sample.id)!;

    expect(sample.contractExpiry).toBeTruthy();
    expect(twin.contractExpiry).toBe("");
    expect(twin.contractSignDate).toBe("");
    expect(twin.daysToExpiry).toBe(0);
    expect(twin.hasSocialSecurity).toBe(false);
    expect(twin.idCard).toBe("");
    // 组织协作需要的字段仍然可读，否则排座/花名册/部门树都会瞎
    expect(twin.name).toBeTruthy();
    expect(twin.department !== undefined).toBe(true);
  });

  it("EMPLOYEE 读自己的详情仍拿得到完整合同信息（本人豁免）", async () => {
    const hr = await list(session("HR", null));
    const me = hr.items[0];
    authRef = session("EMPLOYEE", me.id);
    const res = await fetch(`${base}/${me.id}`);
    const self = (await res.json()) as EmployeeView;
    expect(self.id).toBe(me.id);
    expect(self.idCard).toBe(me.idCard);
  });
});
