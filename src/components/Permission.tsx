import React from 'react';
import { hasPermission } from '../utils/permission';
import { useUserStore } from '../store/useUserStore';

export interface PermissionProps {
  /**
   * 权限码，例如 'attendance:view'
   */
  code: string;
  /**
   * 需要权限控制的子组件
   */
  children: React.ReactNode;
}

/**
 * 权限控制组件
 * 用于按钮或元素级别的权限控制。如果有权限则渲染 children，否则不渲染。
 *
 * 使用约定：
 * - 纯条件渲染（「有权限才显示某按钮」）→ 用本组件：<Permission code="users:manage">…</Permission>
 * - 权限与其它状态混合判断、或需要布尔值参与逻辑（如表格列数、tab 显隐）→ 仍用
 *   useUserStore 的 hasPermission 直判（见考勤 Table/Filter 的既有用法）
 */
export const Permission: React.FC<PermissionProps> = React.memo(({ code, children }) => {
  // 订阅 userInfo 与权限矩阵，登录态或矩阵修改后即时重渲染
  useUserStore((state) => state.userInfo);

  const isAllowed = hasPermission(code);

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
});

export default Permission;
