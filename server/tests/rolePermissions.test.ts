/**
 * 角色能力矩阵：默认值、硬下限、依赖与即时生效。
 *
 * 这里只测纯逻辑与持久化；HTTP 层由 router-gates / e2e 覆盖。
 * 每个用例前后都恢复默认，避免把矩阵改动留给同进程里的其它测试。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ALL_CAPABILITY_CODES, permissionsForRole, thresholdForCapability } from "../capabilities.ts";
import {
  PermissionMatrixError,
  resetThresholds,
  saveThresholds,
  validateThresholds,
} from "../rolePermissions.ts";
import { requiredRoleFor } from "../authMiddleware.ts";

beforeEach(() => resetThresholds());
afterEach(() => resetThresholds());

describe("角色能力矩阵", () => {
  it("默认值 = 2026-10-25 收口后的现状", () => {
    expect(permissionsForRole("EMPLOYEE")).toEqual(["approvals:view", "settings:view", "todos:view"]);
    expect(thresholdForCapability("notice:view")).toBe("HR");
    expect(thresholdForCapability("users:view")).toBe("HR");
    expect(thresholdForCapability("claims:review")).toBe("ADMIN");
    expect(thresholdForCapability("backup:export")).toBe("SUPER_ADMIN");
    expect(permissionsForRole("SUPER_ADMIN").length).toBe(ALL_CAPABILITY_CODES.length);
  });

  it("硬下限：员工名单不能授予员工", () => {
    expect(validateThresholds({ "users:view": "EMPLOYEE" }).join(" ")).toContain("最低只能给 HR");
    expect(() => saveThresholds({ "users:view": "EMPLOYEE" })).toThrow(PermissionMatrixError);
  });

  it("依赖：合同管理不能高于员工名单的可用范围", () => {
    const issues = validateThresholds({ "users:view": "ADMIN", "contracts:view": "HR" });
    expect(issues.join(" ")).toContain("合同管理");
    expect(issues.join(" ")).toContain("员工名单");
  });

  it("把微信通知下放给员工后，接口门槛立即跟着变", () => {
    saveThresholds({ "notice:view": "EMPLOYEE" });
    expect(permissionsForRole("EMPLOYEE")).toContain("notice:view");
    expect(permissionsForRole("HR")).toContain("notice:view");
    expect(requiredRoleFor("POST", "/notice/generate")).toBe("EMPLOYEE");

    resetThresholds();
    expect(permissionsForRole("EMPLOYEE")).not.toContain("notice:view");
    expect(requiredRoleFor("POST", "/notice/generate")).toBe("HR");
  });

  it("收回 HR 的员工名单时，依赖它的页面必须一起收回", () => {
    expect(() => saveThresholds({ "users:view": "ADMIN" })).toThrow(PermissionMatrixError);

    saveThresholds({
      "users:view": "ADMIN",
      "users:manage": "ADMIN",
      "contracts:view": "ADMIN",
      "forms:view": "ADMIN",
      "print-tools:view": "ADMIN",
    });
    expect(permissionsForRole("HR")).not.toContain("users:view");
    expect(permissionsForRole("ADMIN")).toContain("users:view");
    expect(requiredRoleFor("GET", "/users")).toBe("ADMIN");
  });

  it("超管恒有全部能力，矩阵不能锁死管理入口", () => {
    saveThresholds({ "settings:view": "SUPER_ADMIN" });
    expect(permissionsForRole("SUPER_ADMIN")).toContain("settings:view");
    expect(permissionsForRole("ADMIN")).not.toContain("settings:view");
  });
});
