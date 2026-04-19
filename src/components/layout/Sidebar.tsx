import React, { useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  Building2,
  ListTodo,
  Armchair,
  IdCard,
  FileStack,
  Clock,
  FileSignature,
} from 'lucide-react';
import { useAppSettings } from '../../store/appSettings';
import { useUserStore } from '../../store/useUserStore';

interface SidebarProps {
  isCollapsed?: boolean;
  className?: string;
  onClose?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  /**
   * 可选的权限码。如果配置了该属性，则只有拥有对应权限的用户才能看到该菜单项；
   * 如果未配置，则默认所有用户均可看到。
   */
  permission?: string;
}

const NAVIGATION_CONFIG: NavItem[] = [
  { name: '控制台', href: '/', icon: LayoutDashboard, permission: 'dashboard:view' },
  { name: '员工管理', href: '/users', icon: Users, permission: 'users:view' },
  { name: '宴会排座', href: '/seating', icon: Armchair, permission: 'seating:view' },
  { name: '会议台卡', href: '/name-cards', icon: IdCard, permission: 'name-cards:view' },
  { name: '常用文件', href: '/documents', icon: FileStack, permission: 'documents:view' },
  { name: '考勤管理', href: '/attendance', icon: Clock, permission: 'attendance:view' },
  { name: '合同管理', href: '/contracts', icon: FileSignature, permission: 'contracts:view' },
  { name: '待办事项', href: '/todos', icon: ListTodo, permission: 'todos:view' },
  { name: '系统设置', href: '/settings', icon: Settings, permission: 'settings:view' },
];

const Sidebar = React.memo(function Sidebar({ isCollapsed = false, className = '', onClose }: SidebarProps) {
  const location = useLocation();
  const systemIcon = useAppSettings((state) => state.systemIcon);

  // 订阅 userInfo 以确保权限变化时能重新渲染
  useUserStore((state) => state.userInfo);
  const hasPermission = useUserStore((state) => state.hasPermission);

  const visibleNav = useMemo(() => {
    return NAVIGATION_CONFIG.filter((item) => {
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
            <img src={systemIcon} alt="Logo" className="w-full h-full object-contain bg-white" />
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
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={handleCloseSidebar}
              title={isCollapsed ? item.name : undefined}
              aria-current={isActive ? 'page' : undefined}
              aria-label={isCollapsed ? item.name : undefined}
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
                <span className="whitespace-nowrap text-sm animate-in fade-in duration-300">{item.name}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
});

export default Sidebar;
