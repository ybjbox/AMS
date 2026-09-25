/**
 * 界面能力码 —— 由鉴权网关那张表推出来，不再另立一份真相（批次 G）。
 *
 * 此前 17 个码写在 src/config/permission.ts 的注释里、运行时以浏览器 localStorage
 * 里可编辑的矩阵为准（还有个默认关闭的"严格模式"开关让它整体形同虚设）。
 * 现在：每个码声明成"它想问的那次请求"，最低角色直接问 authMiddleware 的
 * requiredRoleFor —— 与真实 403 判定同一个函数，所以按钮显示与否不可能和后端口径漂移。
 *
 * 允许比派生结果更严（如考勤整表清空：策略表默认写=HR，但路由内 requireRole("ADMIN")），
 * 绝不允许更松 —— 那会做出"点了必 403 的按钮"，正是本批要消灭的东西。
 */
import { requiredRoleFor } from "./authMiddleware.ts";
import { ROLE_LEVEL, type SystemRole } from "./authDb.ts";

interface Capability {
  /** 该能力对应的一次真实请求（path 去掉 /api 前缀） */
  method: string;
  path: string;
  /** 仅当真实门槛比策略表派生的更高时填写（路由内 requireRole 的场合） */
  atLeast?: SystemRole;
}

const CAPABILITIES: Record<string, Capability> = {
  "users:view": { method: "GET", path: "/users" },
  "users:manage": { method: "POST", path: "/users" },
  "attendance:view": { method: "GET", path: "/attendance/records" },
  "attendance:manage": { method: "POST", path: "/attendance/records" },
  // 整表清空排班/打卡：策略表落到默认写=HR，但路由里另 requireRole("ADMIN")
  "attendance:purge": { method: "DELETE", path: "/attendance/records", atLeast: "ADMIN" },
  "approvals:view": { method: "GET", path: "/approvals" },
  "approvals:approve": { method: "PUT", path: "/approvals/APPROVAL_ID" },
  // 合同预览含身份证：接口本身是默认读=EMPLOYEE，但读侧已按角色裁剪，页面收到 HR+
  "contracts:view": { method: "GET", path: "/users/EMP0001", atLeast: "HR" },
  "documents:view": { method: "GET", path: "/documents" },
  "documents:manage": { method: "POST", path: "/documents" },
  "departments:view": { method: "GET", path: "/departments", atLeast: "HR" },
  "departments:manage": { method: "POST", path: "/departments" },
  "settings:view": { method: "GET", path: "/settings" },
  "notice:view": { method: "GET", path: "/notice/models" },
  "forms:view": { method: "GET", path: "/form/templates" },
  "dashboard:view": { method: "GET", path: "/stats/summary" },
  "todos:view": { method: "GET", path: "/todos" },
  // 打印工具（宴会排座 / 会议台卡 / 工作餐券三个标签合成一个入口）：
  // 三个面都只需要自己的名单与版面，全部存在 saved-items（按 username 隔离），
  // 所以一个码就够，不再每页一个同源重复码。
  "print-tools:view": { method: "GET", path: "/saved-items" },
};

/** 该能力要求的最低角色：策略表派生值与显式下限里更严的那个。 */
export function requiredRoleForCapability(code: string): SystemRole {
  const cap = CAPABILITIES[code];
  if (!cap) throw new Error(`未知能力码 ${code}（新增界面门禁必须先在这里登记）`);
  const derived = requiredRoleFor(cap.method, cap.path);
  if (!cap.atLeast) return derived;
  if (ROLE_LEVEL[cap.atLeast] < ROLE_LEVEL[derived]) {
    throw new Error(
      `能力码 ${code} 的 atLeast=${cap.atLeast} 比策略表派生的 ${derived} 更松，会做出点了必 403 的按钮`
    );
  }
  return cap.atLeast;
}

export const ALL_CAPABILITY_CODES: string[] = Object.keys(CAPABILITIES).sort();

/** 某角色可用的能力码。角色秩越高集合越大（单调性由测试钉住）。 */
export function permissionsForRole(role: SystemRole): string[] {
  return ALL_CAPABILITY_CODES.filter((code) => ROLE_LEVEL[role] >= ROLE_LEVEL[requiredRoleForCapability(code)]);
}

/** 全量 role→能力表，供管理端只读视图（GET /auth/capabilities）。 */
export function capabilitiesByRole(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const role of Object.keys(ROLE_LEVEL) as SystemRole[]) out[role] = permissionsForRole(role);
  return out;
}
