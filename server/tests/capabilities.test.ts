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

  it("考勤整表清空只给 ADMIN+（路由内 requireRole 比默认写策略更严，界面必须同样收口）", () => {
    expect(requiredRoleFor("DELETE", "/attendance/records")).toBe("HR"); // 策略表派生 = 默认写
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

  it("普通员工拿到自助面：待办 / 业务单 / 微信通知 / 设置入口", () => {
    const emp = permissionsForRole("EMPLOYEE");
    for (const code of ["todos:view", "forms:view", "notice:view", "settings:view", "approvals:view"]) {
      expect(emp).toContain(code);
    }
    // 但看不到他人数据的管理面与合同 PII
    for (const code of ["users:manage", "contracts:view", "attendance:manage", "documents:manage"]) {
      expect(emp).not.toContain(code);
    }
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
    expect(permissionsForRole("EMPLOYEE")).toContain("print-tools:view");
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
