import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';

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
  const hasPermission = useUserStore((state) => state.hasPermission);

  // 1. 判断是否登录
  if (!userInfo) {
    return <Navigate to="/login" replace />;
  }

  // 2. 如果配置了权限要求，则判断权限
  if (requiredPermission && !hasPermission(requiredPermission)) {
    // 员工没有后台权限时回自己的门户：403 页的「返回首页」会再撞一次无权限，形成循环
    if ((userInfo.role ?? '').toUpperCase() === 'EMPLOYEE') {
      return <Navigate to="/my" replace />;
    }
    return <Navigate to="/403" replace />;
  }

  // 3. 通过校验，渲染子组件
  return <>{children}</>;
}
