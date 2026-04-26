import React, { useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Building2, User as UserIcon } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { useUserStore } from '@/store/useUserStore';
import { routeConfig } from '@/config/routes';

interface SidebarProps {
  isCollapsed?: boolean;
  className?: string;
  onClose?: () => void;
}

const Sidebar = React.memo(function Sidebar({ isCollapsed = false, className = '', onClose }: SidebarProps) {
  const location = useLocation();
  const systemIcon = useAppSettings((state) => state.systemIcon);

  // 订阅 userInfo 以确保权限变化时能重新渲染
  const userInfo = useUserStore((state) => state.userInfo);
  const hasPermission = useUserStore((state) => state.hasPermission);

  const visibleNav = useMemo(() => {
    return routeConfig.filter((item) => {
      // 如果配置了 permission 且当前用户没有该权限，则过滤掉；否则默认显示
      if (item.permission) {
        return hasPermission(item.permission);
      }
      return true;
    });
  }, [hasPermission]);

  const handleCloseSidebar = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  return (
    <aside
      className={`bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm rounded-2xl flex flex-col print:hidden shrink-0 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      } ${className}`}
    >
      {/* Logo */}
      <div
        className={`h-20 flex items-center transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6'}`}
      >
        <div className="w-9 h-9 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          {systemIcon ? (
            <img src={systemIcon} alt="Logo" className="w-full h-full object-contain bg-white dark:bg-zinc-800" />
          ) : (
            <Building2 className="h-5 w-5 text-white" />
          )}
        </div>
        {!isCollapsed && (
          <span className="text-lg font-bold text-zinc-800 dark:text-white ml-3 whitespace-nowrap overflow-hidden animate-in fade-in duration-300">
            AMS 系统
          </span>
        )}
      </div>
      {/* Nav */}
      <nav aria-label="主导航" className="px-3 pb-4 space-y-1.5 flex-1 overflow-y-auto overflow-x-hidden">
        {visibleNav.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.label}
              to={item.path}
              onClick={handleCloseSidebar}
              title={isCollapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              className={`flex items-center py-2.5 px-3 rounded-xl transition-all duration-300 ease-in-out group ${
                isCollapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-blue-50/80 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white hover:shadow-sm hover:-translate-y-0.5'
              }`}
            >
              <item.icon
                className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'} ${isCollapsed ? '' : 'mr-3'}`}
              />
              {!isCollapsed && (
                <span className="whitespace-nowrap text-sm animate-in fade-in duration-300">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>
      {/* 用户信息底部区 */}
      <div className={`border-t border-zinc-200/60 dark:border-zinc-700/60 p-3 shrink-0 ${isCollapsed ? 'flex justify-center' : ''}`}>
        {isCollapsed ? (
          // 折叠状态：仅显示头像
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        ) : (
          // 展开状态：头像 + 姓名 + 角色
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <UserIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                {userInfo?.username || '用户'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {userInfo?.role === 'admin' ? '管理员' : '普通员工'}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});

export default Sidebar;
