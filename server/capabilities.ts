/**
 * 能力码的公共出口（薄门面）。
 *
 * 真正的清单位于 `permissionCatalog.ts`，生效矩阵位于 `rolePermissions.ts`。
 * 这里只做 re-export，保证 authRouter / 测试 / 前端注释引用同一个来源，
 * 不再出现「界面一套、接口一套」的第二套真相。
 */
export {
  ALL_CAPABILITY_CODES,
  CAPABILITIES,
  CAPABILITY_BY_CODE,
  HARDCODED_AREAS,
  type CapabilityDef,
  type CapabilityGroup,
} from "./permissionCatalog.ts";

export {
  capabilitiesByRole,
  getThresholds,
  matrixForUI,
  permissionsForRole,
  PermissionMatrixError,
  resetThresholds,
  ROLE_ORDER,
  saveThresholds,
  thresholdForCapability,
  validateThresholds,
  type ThresholdMap,
} from "./rolePermissions.ts";

/** 兼容旧调用名：能力当前的最低可用角色（阈值） */
export { thresholdForCapability as requiredRoleForCapability } from "./rolePermissions.ts";
