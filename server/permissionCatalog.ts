/**
 * 界面能力目录（权限矩阵的可配置单元）。
 *
 * 这里是**唯一的能力清单**：代码里的路由映射、服务端的生效矩阵、设置页的矩阵 UI
 * 都读同一份。`floor` 是硬下限——矩阵不能把能力授予低于它的角色；`defaultMinRole`
 * 是初始阈值（与 2026-10-25 收口后的现状一致）；`dependsOn` 是页面级依赖，
 * 保存时会校验“同一角色必须同时拥有依赖”，避免出现“能进页面但接口 403”。
 */
import type { SystemRole } from "./authDb.ts";

export type CapabilityGroup = "员工自助" | "HR 数据" | "管理" | "安全";

export interface CapabilityDef {
  code: string;
  label: string;
  group: CapabilityGroup;
  /** 永远不能授予低于这个角色的能力 */
  floor: SystemRole;
  /** 初始阈值（默认矩阵） */
  defaultMinRole: SystemRole;
  /** 授予本能力时，同一角色必须同时拥有的能力 */
  dependsOn?: string[];
}

export const CAPABILITIES: CapabilityDef[] = [
  // ---- 员工自助 ----
  { code: "approvals:view", label: "审批中心（我的申请）", group: "员工自助", floor: "EMPLOYEE", defaultMinRole: "EMPLOYEE" },
  { code: "settings:view", label: "个人 / 系统设置入口", group: "员工自助", floor: "EMPLOYEE", defaultMinRole: "EMPLOYEE" },
  { code: "todos:view", label: "待办事项", group: "员工自助", floor: "EMPLOYEE", defaultMinRole: "EMPLOYEE" },

  // ---- HR 数据面 ----
  // notice 是唯一可下放给员工的安全模块（页面只调 /notice，不读员工花名册）
  { code: "notice:view", label: "微信通知生成器", group: "HR 数据", floor: "EMPLOYEE", defaultMinRole: "HR" },
  { code: "ai:use", label: "AI 助手", group: "HR 数据", floor: "HR", defaultMinRole: "HR" },
  { code: "users:view", label: "员工名单（读）", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["departments:view"] },
  { code: "users:manage", label: "员工档案（写）", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["users:view"] },
  { code: "attendance:view", label: "考勤记录与判定（读）", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["departments:view"] },
  { code: "attendance:manage", label: "考勤记录（导入 / 编辑）", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["attendance:view", "departments:view"] },
  { code: "contracts:view", label: "合同管理", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["users:view"] },
  { code: "documents:view", label: "常用文件（读）", group: "HR 数据", floor: "HR", defaultMinRole: "HR" },
  { code: "documents:manage", label: "常用文件（写）", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["documents:view"] },
  { code: "departments:view", label: "部门架构（读）", group: "HR 数据", floor: "HR", defaultMinRole: "HR" },
  { code: "forms:view", label: "业务单据", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["users:view"] },
  { code: "print-tools:view", label: "打印工具（排座 / 台卡 / 餐券）", group: "HR 数据", floor: "HR", defaultMinRole: "HR", dependsOn: ["users:view"] },
  { code: "dashboard:view", label: "控制台", group: "HR 数据", floor: "HR", defaultMinRole: "HR" },

  // ---- 管理 ----
  { code: "approvals:approve", label: "审批决定", group: "管理", floor: "HR", defaultMinRole: "HR", dependsOn: ["approvals:view"] },
  { code: "attendance:purge", label: "考勤整表清空", group: "管理", floor: "ADMIN", defaultMinRole: "ADMIN", dependsOn: ["attendance:manage"] },
  { code: "departments:manage", label: "部门架构（写）", group: "管理", floor: "ADMIN", defaultMinRole: "ADMIN", dependsOn: ["departments:view"] },
  { code: "claims:review", label: "认领核对 / 发身份", group: "管理", floor: "ADMIN", defaultMinRole: "ADMIN" },
  { code: "export-templates:manage", label: "导出脚本 / 主题", group: "管理", floor: "ADMIN", defaultMinRole: "ADMIN" },

  // ---- 安全 ----
  { code: "backup:export", label: "备份导出", group: "安全", floor: "SUPER_ADMIN", defaultMinRole: "SUPER_ADMIN" },
  { code: "backup:import", label: "备份导入", group: "安全", floor: "SUPER_ADMIN", defaultMinRole: "SUPER_ADMIN" },
];

export const ALL_CAPABILITY_CODES: string[] = CAPABILITIES.map((c) => c.code).sort();

export const CAPABILITY_BY_CODE: Record<string, CapabilityDef> = Object.fromEntries(
  CAPABILITIES.map((c) => [c.code, c])
);

/** 安全硬编码：这些设置页签/接口不走能力矩阵，始终按角色判定。 */
export const HARDCODED_AREAS = [
  "账号管理（/auth/accounts）",
  "审计日志 / 系统日志（/audit-logs）",
  "运行诊断（/system）",
  "通知出站通道（/notify）",
  "企业微信打卡配置（/wecom）",
  "公告管理（/announcements 写）",
  "到期提醒（/reminders）",
  "文件下载（/files）",
  "品牌资源写入（/branding）",
];
