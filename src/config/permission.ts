import { SystemRole } from '../types/user';

/**
 * 默认权限矩阵（体验层显隐；真正的强制在后端 authGate / requireRole）。
 * 每一行授予都对应后端的最小角色，改这里前先核对 server/authMiddleware.ts 的策略表：
 *   - users:manage      →  /api/users 写操作默认策略 = HR+（authGate DEFAULT_POLICY.write）
 *   - attendance:manage →  考勤写操作 = HR+
 *   - approvals:approve →  /api/approvals/:id/decide requireRole("HR")
 *   - contracts:view    →  合同预览含身份证，读侧裁剪后 <HR 拿不到 idCard，故页面也只到 HR+
 *   - documents:manage  →  文档上传/删除等写操作 = HR+（authGate 默认写策略）
 *   - departments:view  →  部门管理页（顶层 /departments）；写操作 = HR+
 *   - settings:view     →  仅决定 /settings 页面可达；页内面板再按角色秩过滤，
 *                          员工可见「个人设置 / 外观设置」（强制改密流程需要入口）
 *   - approvals:view    →  POST /api/approvals 对任何登录用户开放（自助提交）
 *   - notice:view       →  /api/notice/* 策略 = EMPLOYEE（AI 启停/仅管理员在 router 内按 aiConfig 二次判断）
 * 注意：本文件只作初始值 /「恢复默认」的来源；运行时以 usePermissionsStore
 * （权限矩阵面板可编辑）为准。
 */
export const permissions: Record<string, string[]> = {
  [SystemRole.SUPER_ADMIN]: ['*'],
  [SystemRole.ADMIN]: ['*'],
  [SystemRole.HR]: [
    'dashboard:view',
    'users:view',
    'users:manage',
    'departments:view',
    'attendance:view',
    'attendance:manage',
    'contracts:view',
    'todos:view',
    'documents:view',
    'documents:manage',
    'approvals:view',
    'approvals:approve',
    'notice:view',
    'settings:view',
  ],
  [SystemRole.EMPLOYEE]: [
    'dashboard:view',
    'attendance:view',
    'todos:view',
    'documents:view',
    'approvals:view',
    'notice:view',
    'settings:view',
  ],
};
