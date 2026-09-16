import React, { useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, User as UserIcon } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { useUserStore } from '@/store/useUserStore';
import { useTodoStore } from '@/store/useTodoStore';
import { routeConfig, NAV_GROUP_ORDER, RouteConfig } from '@/config/routes';
import { getRoleDisplayName } from '@/utils/roleUtils';
import BackendStatusIndicator from '@/components/BackendStatusIndicator';

interface SidebarProps {
  isCollapsed?: boolean;
  className?: string;
  onClose?: () => void;
}

const Sidebar = React.memo(function Sidebar({ isCollapsed = false, className = '', onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const systemIcon = useAppSettings((state) => state.systemIcon);

  const handleGoToProfile = useCallback(() => {
    navigate('/settings');
    if (onClose) onClose();
  }, [navigate, onClose]);

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

  // 待办未完成数（侧边栏角标）
  const pendingTodoCount = useTodoStore((state) => state.todos.filter((t) => !t.completed).length);

  // 按域分组（控制台独立置顶，不参与分组）
  const homeNav = useMemo(() => visibleNav.filter((item) => item.path === '/'), [visibleNav]);
  const groupedNav = useMemo(() => {
    const groups = new Map<string, RouteConfig[]>();
    for (const item of visibleNav) {
      if (item.path === '/') continue;
      const key = item.group || '协作';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    // 按预定义顺序输出
    return NAV_GROUP_ORDER
      .filter((g) => groups.has(g))
      .map((g) => ({ group: g, items: groups.get(g)! }));
  }, [visibleNav]);

  const handleCloseSidebar = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  /** 单个导航项渲染 */
  const renderNavItem = useCallback((item: RouteConfig) => {
    const isActive = location.pathname === item.path;
    const showBadge = item.path === '/todos' && pendingTodoCount > 0;
    return (
      <Link
        key={item.label}
        to={item.path}
        onClick={handleCloseSidebar}
        title={isCollapsed ? (showBadge ? `${item.label} (${pendingTodoCount})` : item.label) : undefined}
        aria-current={isActive ? 'page' : undefined}
        aria-label={isCollapsed ? (showBadge ? `${item.label}，${pendingTodoCount} 项未完成` : item.label) : undefined}
        className={`flex items-center py-2.5 px-3 rounded-xl transition duration-300 ease-in-out group ${
          isCollapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm ring-1 ring-emerald-500/20'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white hover:shadow-sm hover:-translate-y-0.5'
        }`}
      >
        <item.icon
          className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'} ${isCollapsed ? '' : 'mr-3'}`}
        />
        {!isCollapsed && (
          <span className="whitespace-nowrap text-sm animate-in fade-in duration-300 flex-1">{item.label}</span>
        )}
        {!isCollapsed && showBadge && (
          <span
            className={`ml-2 shrink-0 min-w-[20px] px-1.5 py-0.5 rounded-full text-[11px] font-medium text-center ${
              isActive
                ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
            }`}
            aria-hidden="true"
          >
            {pendingTodoCount > 99 ? '99+' : pendingTodoCount}
          </span>
        )}
      </Link>
    );
  }, [location.pathname, isCollapsed, pendingTodoCount, handleCloseSidebar]);

  return (
    <aside
      className={`bg-white/80 dark:bg-zinc-800/70 backdrop-blur-xl border border-zinc-200/60 dark:border-white/10 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-2xl flex flex-col print:hidden shrink-0 transition duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      } ${className}`}
    >
      {/* Logo */}
      <div
        className={`h-20 flex items-center transition duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6'}`}
      >
        <div className="w-9 h-9 brand-gradient rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          {systemIcon ? (
            <img src={systemIcon} alt="Logo" width={36} height={36} className="w-full h-full object-contain bg-white dark:bg-zinc-800" />
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
        {/* 控制台（置顶，无分组） */}
        {homeNav.map(renderNavItem)}

        {/* 分组导航 */}
        {groupedNav.map(({ group, items }) => (
          <div key={group} className="pt-2 first:pt-0">
            {!isCollapsed ? (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none">
                {group}
              </p>
            ) : (
              <div className="mx-2 mb-1.5 border-t border-zinc-100 dark:border-zinc-700/60" role="separator" aria-hidden="true" />
            )}
            <div className="space-y-1.5">{items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>
      {/* 用户信息底部区 */}
      <div className={`border-t border-zinc-200/60 dark:border-zinc-700/60 p-3 shrink-0 ${isCollapsed ? 'flex flex-col items-center gap-1' : ''}`}>
        {isCollapsed ? (
          // 折叠状态：仅显示头像
          <button
            onClick={handleGoToProfile}
            title={userInfo?.username || '用户'}
            aria-label="前往个人设置"
            className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center hover:ring-2 hover:ring-emerald-500/40 transition"
          >
            {userInfo?.username
              ? <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {userInfo.username.charAt(0).toUpperCase()}
                </span>
              : <UserIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            }
          </button>
        ) : (
          // 展开状态：头像 + 姓名 + 角色；系统状态收进底部行，不再悬浮遮挡页面内容
          <>
            <button
              onClick={handleGoToProfile}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer group text-left"
              aria-label="前往个人设置"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400 select-none">
                {userInfo?.username
                  ? userInfo.username.charAt(0).toUpperCase()
                  : <UserIcon className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {userInfo?.username || '用户'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {getRoleDisplayName(userInfo?.role)}
                </p>
              </div>
            </button>
            <div className="px-2 pt-1.5 flex items-center justify-between">
              <BackendStatusIndicator variant="bare" className="scale-90 origin-left" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
});

export default Sidebar;
