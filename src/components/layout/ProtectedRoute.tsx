import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { usePermissionsStore } from '@/store/permissions';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * 需要的权限码，例如 'users:view'
   */
  requiredPermission?: string;
}

export default function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  // 订阅 userInfo 与权限矩阵（矩阵被管理员修改时本页即时重新判定）
  const userInfo = useUserStore((state) => state.userInfo);
  usePermissionsStore((state) => state.permissions);
  const hasPermission = useUserStore((state) => state.hasPermission);

  // 1. 判断是否登录
  if (!userInfo) {
    return <Navigate to="/login" replace />;
  }

  // 2. 如果配置了权限要求，则判断权限
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/403" replace />;
  }

  // 3. 通过校验，渲染子组件
  return <>{children}</>;
}
