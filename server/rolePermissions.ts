/**
 * 角色 → 能力矩阵的持久化与生效逻辑。
 *
 * 存储用 settings 表的一条 JSON（阈值模型）：每个能力只存一个「最低可用角色」。
 * 这等价于一张单调矩阵（低角色有的能力，高角色一定有），避免出现
 * 「HR 能进、ADMIN 反而不能」这种无法解释的状态。
 *
 * 三条硬约束：
 * 1. floor：能力不能授予低于目录里声明的角色（例：员工名单最低 HR）；
 * 2. dependsOn：授予某能力时，同一角色必须同时拥有依赖（例：合同 → 员工名单）；
 * 3. SUPER_ADMIN 恒有全部能力（permissionsForRole 直接返回全集，防锁死）。
 *
 * 读取失败 / 旧数据不合法时 fail-closed：低于 floor 的条目回落到默认，
 * 依赖不满足时把依赖方提高到依赖的最低角色（收窄而不是放宽）。
 */
import { onDbReload } from "./db.ts";
import { ROLE_LEVEL, type SystemRole } from "./authDb.ts";
import { getSetting, setSetting } from "./settingsDb.ts";
import {
  ALL_CAPABILITY_CODES,
  CAPABILITIES,
  CAPABILITY_BY_CODE,
  HARDCODED_AREAS,
} from "./permissionCatalog.ts";

const SETTINGS_KEY = "role_permissions";

export const ROLE_ORDER: SystemRole[] = ["EMPLOYEE", "HR", "ADMIN", "SUPER_ADMIN"];

export type ThresholdMap = Record<string, SystemRole>;

const DEFAULTS: ThresholdMap = Object.fromEntries(
  CAPABILITIES.map((c) => [c.code, c.defaultMinRole])
) as ThresholdMap;

const rank = (role: SystemRole) => ROLE_LEVEL[role];

function isRole(value: unknown): value is SystemRole {
  return typeof value === "string" && value in ROLE_LEVEL;
}

/** 两个角色里更严（更高）的那个 */
function stricter(a: SystemRole, b: SystemRole): SystemRole {
  return rank(a) >= rank(b) ? a : b;
}

/** 校验一份已补全的阈值表；返回问题列表（空 = 通过） */
function validateResolved(next: ThresholdMap): string[] {
  const issues: string[] = [];

  for (const def of CAPABILITIES) {
    const value = next[def.code];
    if (!isRole(value)) {
      issues.push(`${def.code} 的角色无效`);
      continue;
    }
    if (rank(value) < rank(def.floor)) {
      issues.push(`${def.label} 最低只能给 ${def.floor}，不能给 ${value}`);
    }
  }

  for (const def of CAPABILITIES) {
    for (const dep of def.dependsOn ?? []) {
      const depDef = CAPABILITY_BY_CODE[dep];
      if (!depDef) {
        issues.push(`${def.code} 依赖了未登记的能力 ${dep}`);
        continue;
      }
      if (rank(next[dep]) > rank(next[def.code])) {
        issues.push(
          `${def.label} 需要同时给 ${depDef.label}（${dep}），否则页面能进但接口 403`
        );
      }
    }
  }

  return issues;
}

/** 校验输入；未提交的代码按默认值补齐，返回问题列表（空 = 通过） */
export function validateThresholds(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["矩阵格式无效"];
  const next = { ...DEFAULTS } as ThresholdMap;
  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    if (!CAPABILITY_BY_CODE[code]) return [`未知能力码 ${code}`];
    if (!isRole(value)) return [`${code} 的角色无效`];
    next[code] = value;
  }
  return validateResolved(next);
}

/** 读取时 sanitize：只修不抛，任何不合法项都往更严的方向回落 */
function sanitize(input: unknown): ThresholdMap {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const next = { ...DEFAULTS } as ThresholdMap;

  for (const def of CAPABILITIES) {
    const value = raw[def.code];
    if (!isRole(value)) continue;
    if (rank(value) < rank(def.floor)) {
      console.warn(`[permissions] ${def.code} 低于硬下限 ${def.floor}，已回落默认 ${DEFAULTS[def.code]}`);
      continue;
    }
    next[def.code] = value;
  }

  // 依赖不满足时收紧依赖方：让「拥有它」的角色集合 ⊆「拥有依赖」的角色集合
  for (const def of CAPABILITIES) {
    for (const dep of def.dependsOn ?? []) {
      next[def.code] = stricter(next[def.code], next[dep]);
    }
  }

  return next;
}

function load(): ThresholdMap {
  try {
    return sanitize(getSetting(SETTINGS_KEY));
  } catch (e) {
    console.error("[permissions] 读取矩阵失败，使用默认值：", e);
    return { ...DEFAULTS };
  }
}

let cache: ThresholdMap = load();

onDbReload(() => {
  cache = load();
});

export class PermissionMatrixError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(issues.join("；"));
    this.name = "PermissionMatrixError";
    this.issues = issues;
  }
}

export function getThresholds(): ThresholdMap {
  return { ...cache };
}

export function thresholdForCapability(code: string): SystemRole {
  const value = cache[code];
  if (!value) throw new Error(`未知能力码 ${code}（新增界面门禁必须先登记到 permissionCatalog）`);
  return value;
}

/** 某角色当前可用的能力码（SUPER_ADMIN 恒为全集，防止把管理入口锁死） */
export function permissionsForRole(role: SystemRole): string[] {
  if (role === "SUPER_ADMIN") return [...ALL_CAPABILITY_CODES];
  const level = rank(role);
  return ALL_CAPABILITY_CODES.filter((code) => level >= rank(thresholdForCapability(code)));
}

/** 全量 role → 能力表（供只读视图 / 测试） */
export function capabilitiesByRole(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const role of ROLE_ORDER) out[role] = permissionsForRole(role);
  return out;
}

/** 设置页需要的矩阵视图：能力元数据 + 当前阈值 + 硬编码区域 */
export function matrixForUI() {
  return {
    roles: ROLE_ORDER,
    capabilities: CAPABILITIES.map((c) => ({ ...c, threshold: cache[c.code] })),
    hardcoded: HARDCODED_AREAS,
  };
}

/** 保存矩阵：先校验（未提交的代码沿用当前值），再落库并刷新缓存 */
export function saveThresholds(input: unknown): ThresholdMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PermissionMatrixError(["矩阵格式无效"]);
  }
  const next = { ...cache };
  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    if (!CAPABILITY_BY_CODE[code]) throw new PermissionMatrixError([`未知能力码 ${code}`]);
    if (!isRole(value)) throw new PermissionMatrixError([`${code} 的角色无效`]);
    next[code] = value;
  }
  const issues = validateResolved(next);
  if (issues.length) throw new PermissionMatrixError(issues);

  setSetting(SETTINGS_KEY, next);
  cache = next;
  return { ...next };
}

/** 恢复默认（设置页的「恢复默认」） */
export function resetThresholds(): ThresholdMap {
  setSetting(SETTINGS_KEY, DEFAULTS);
  cache = { ...DEFAULTS };
  return { ...cache };
}
