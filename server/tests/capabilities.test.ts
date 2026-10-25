/**
 * 能力码必须由鉴权网关那张表推出来（批次 G 第一步）。
 * 这些断言的意义：以后谁改了 POLICIES 或路由内 requireRole，界面能力会自动跟着走；
 * 而"比后端口径更松"的写法（会做出点了必 403 的按钮）在加载期就抛。
 */
import { describe, it, expect } from "vitest";
import { permissionsForRole, requiredRoleForCapability, ALL_CAPABILITY_CODES } from "../capabilities.ts";
import { requiredRoleFor } from "../authMiddleware.ts";
import type { SystemRole } from "../authDb.ts";
import fs from "node:fs";
import path from "node:path";

/** 扫出前端用到的所有能力码（与界面里真实的调用形状对齐） */
function codesUsedByClient(): string[] {
  const root = path.resolve("../src");
  const out = new Set<string>();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/.(ts|tsx)$/.test(e.name)) {
        const s = fs.readFileSync(f, "utf8");
        for (const m of s.matchAll(/hasPermission(s*'([a-z-]+:[a-z-]+)'s*)|permission: '([a-z-]+:[a-z-]+)'|requiredPermission={?'([a-z-]+:[a-z-]+)'/g)) {
          out.add(m[1] || m[2] || m[3]);
        }
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return [...out];
}

const ROLES: SystemRole[] = ["EMPLOYEE", "HR", "ADMIN", "SUPER_ADMIN"];

describe("能力码与策略表同源", () => {
  it("每个能力码都能解析出最低角色，且不低于策略表对该请求的判定", () => {
    for (const code of ALL_CAPABILITY_CODES) {
      const req = requiredRoleForCapability(code);
      expect(ROLES.includes(req)).toBe(true);
      expect(ROLES.indexOf(req)).toBeGreaterThanOrEqual(0);
    }
  });

  it("考勤整表清空只给 ADMIN+（能力矩阵与路由内 requireRole 同源）", () => {
    expect(requiredRoleFor("DELETE", "/attendance/records")).toBe("ADMIN");
    expect(requiredRoleForCapability("attendance:purge")).toBe("ADMIN");
    expect(permissionsForRole("HR")).not.toContain("attendance:purge");
    expect(permissionsForRole("ADMIN")).toContain("attendance:purge");
  });

  it("部门写操作对 HR 也不给，否则就是看得见按钮、点了必 403 的假象", () => {
    expect(permissionsForRole("HR")).not.toContain("departments:manage");
    expect(permissionsForRole("ADMIN")).toContain("departments:manage");
  });

  it("角色秩单调：低角色的能力集是高角色的子集", () => {
    for (let i = 1; i < ROLES.length; i += 1) {
      const lower = permissionsForRole(ROLES[i - 1]);
      const higher = permissionsForRole(ROLES[i]);
      expect(lower.every((c) => higher.includes(c))).toBe(true);
    }
  });

  it("普通员工只拿到自助面：待办 / 审批 / 设置（2026-10-25 权限收口）", () => {
    expect(permissionsForRole("EMPLOYEE")).toEqual(["approvals:view", "settings:view", "todos:view"]);
  });

  it("员工读 HR 数据面一律 HR+；自己的接口仍显式放行", () => {
    for (const path of [
      "/users",
      "/attendance/records",
      "/documents",
      "/departments",
      "/stats/workforce",
      "/saved-items",
      "/form/records",
    ]) {
      expect(requiredRoleFor("GET", path), path).toBe("HR");
    }
    for (const path of [
      "/my/summary",
      "/my/disputes",
      "/approvals/mine",
      "/approvals/comp-balance",
      "/todos",
      "/notifications",
      // 有效公告是全员通知面，收口时不能跟着 HR 数据面一起收
      "/announcements",
      "/auth/me",
    ]) {
      expect(requiredRoleFor("GET", path), path).toBe("EMPLOYEE");
    }
    expect(requiredRoleFor("POST", "/approvals")).toBe("EMPLOYEE");
    expect(requiredRoleFor("PUT", "/approvals/A/withdraw")).toBe("EMPLOYEE");
  });

  it("含凭据的整库副本只给超管；员工自助的两条动作不再要 HR（批次 1）", () => {
    expect(requiredRoleFor("GET", "/backup/export/ams-2026.db")).toBe("SUPER_ADMIN");
    expect(permissionsForRole("ADMIN")).not.toContain("backup:export");
    expect(permissionsForRole("SUPER_ADMIN")).toContain("backup:export");

    // 这两条此前不在 POLICIES 里 ⇒ 落默认写 = HR：登录强制改密后被引导去改资料、
    // 员工撤回自己的申请，界面摆了入口却必然 403。
    expect(requiredRoleFor("PUT", "/auth/profile")).toBe("EMPLOYEE");
    expect(requiredRoleFor("PUT", "/approvals/APPROVAL-1/withdraw")).toBe("EMPLOYEE");
    // 撤回仍然只有决定权在 HR+：网关放开下限，归属由数据层把
    expect(requiredRoleFor("PUT", "/approvals/APPROVAL-1/decide")).toBe("HR");
  });

  it("三个打印面收敛成一个入口码（同源重复码不再各留一份）", () => {
    expect(permissionsForRole("HR")).toContain("print-tools:view");
    expect(permissionsForRole("EMPLOYEE")).not.toContain("print-tools:view");
    for (const gone of ["seating:view", "name-cards:view", "meal-vouchers:view"]) {
      expect(ALL_CAPABILITY_CODES).not.toContain(gone);
    }
  });

  it("前端用到的每个能力码都必须在表里登记（漏登记会被 fail-closed 一律拒绝）", () => {
    const missing = codesUsedByClient().filter((c) => !ALL_CAPABILITY_CODES.includes(c));
    expect(missing).toEqual([]);
  });

  it("会话下发用的就是这个函数（登录响应结构里带 permissions）", () => {
    expect(permissionsForRole("SUPER_ADMIN").length).toBe(ALL_CAPABILITY_CODES.length);
  });
});
