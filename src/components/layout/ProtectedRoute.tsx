import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserStore } from '../../store/useUserStore';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * 需要的权限码，例如 'users:view'
   */
  requiredPermission?: string;
}

export default function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  // 订阅 userInfo 状态
  const userInfo = useUserStore((state) => state.userInfo);
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
