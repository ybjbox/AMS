/**
 * 员工 PII 读侧裁剪回归测试（第二梯队 #12）：
 * authGate 默认「登录即可读」曾让任意账号通过 GET /api/users 拖走全员
 * 身份证 / 住址 / 手机号。现在由 employeesRouter 按角色裁剪。
 */
import { describe, it, expect } from "vitest";
import { canViewPii, redactPii } from "../employeesRouter.ts";
import type { SessionContext } from "../authDb.ts";

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
  it("身份证/住址清空，手机号掩码，其余字段保持可读", () => {
    const full = {
      id: "EMP0002",
      name: "张三",
      idCard: "110101199003074610",
      phone: "13800001234",
      registeredAddress: "北京市东城区某街道1号",
      currentAddress: "上海市徐汇区某路2号",
      department: "技术部",
    };
    const out = redactPii(full as never);
    expect(out.idCard).toBe("");
    expect(out.registeredAddress).toBe("");
    expect(out.currentAddress).toBe("");
    expect(out.phone).toBe("138****1234");
    expect(out.name).toBe("张三"); // 非 PII 字段不受影响，考勤/合同页仍可用
    expect(out.department).toBe("技术部");
  });

  it("短手机号不泄露残余位数；空号保持为空", () => {
    expect(redactPii({ phone: "12345" } as never).phone).toBe("****");
    expect(redactPii({ phone: "" } as never).phone).toBe("");
  });
});
