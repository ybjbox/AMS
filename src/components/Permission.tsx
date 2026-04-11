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
 */
export const Permission: React.FC<PermissionProps> = React.memo(({ code, children }) => {
  // 订阅 userInfo 状态，确保在用户登录/登出或角色变化时，组件能够自动重新渲染
  useUserStore((state) => state.userInfo);

  const isAllowed = hasPermission(code);

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
});

export default Permission;
