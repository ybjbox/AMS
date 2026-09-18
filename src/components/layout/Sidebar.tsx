import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { DEFAULT_SYSTEM_ICON } from '@/config/constants';
import { useUserStore } from '@/store/useUserStore';
import { usePermissionsStore } from '@/store/permissions';
import { useTodoStore } from '@/store/useTodoStore';
import { routeConfig, applyNavOrder, RouteConfig } from '@/config/routes';
import UserMenu from './UserMenu';

interface SidebarProps {
  isCollapsed?: boolean;
  className?: string;
  onClose?: () => void;
  /** 传入时渲染骑跨侧栏右缘的圆形折叠钮（桌面端）；移动端抽屉不传即不渲染 */
  onToggleCollapse?: () => void;
}

const Sidebar = React.memo(function Sidebar({ isCollapsed = false, className = '', onClose, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const systemIcon = useAppSettings((state) => state.systemIcon);

  // 订阅权限矩阵与 hasPermission，变化时导航即时重渲染
  const permissionsMap = usePermissionsStore((state) => state.permissions);
  const hasPermission = useUserStore((state) => state.hasPermission);

  const visibleNav = useMemo(() => {
    return routeConfig.filter((item) => {
      // /settings 的入口已整合进底部账户弹窗（UserMenu），导航不再重复列出
      if (item.path === '/settings') return false;
      // 如果配置了 permission 且当前用户没有该权限，则过滤掉；否则默认显示
      if (item.permission) {
        return hasPermission(item.permission);
      }
      return true;
    });
  }, [hasPermission, permissionsMap]);

  // 待办未完成数（侧边栏角标）
  const pendingTodoCount = useTodoStore((state) => state.todos.filter((t) => !t.completed).length);

  // 用户在「系统设置 → 功能模块排序」里保存的自定义顺序
  const navOrder = useAppSettings((state) => state.navOrder);
  const orderedNav = useMemo(() => applyNavOrder(visibleNav, navOrder), [visibleNav, navOrder]);

  const handleCloseSidebar = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // 滚动提示：隐藏滚动条（窄侧栏里常驻滚动条抢宽度且视觉杂乱），
  // 改为底部渐隐 + 下箭头示意「下方还有内容」，滚到底自动消失
  const navRef = useRef<HTMLElement | null>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const updateScrollHint = useCallback(() => {
    const el = navRef.current;
    if (el) setCanScrollDown(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  }, []);
  useEffect(() => {
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [updateScrollHint, orderedNav, isCollapsed]);

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
        className={`relative flex items-center justify-center py-2.5 px-3 rounded-xl transition duration-250 ease-[var(--ease-smooth-out)] group ${
          isActive
            ? 'bg-brand-50 dark:bg-brand-900/25 text-brand-700 dark:text-brand-300 font-semibold shadow-sm ring-1 ring-brand-500/20'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white hover:shadow-sm'
        }`}
      >
        {/* 图标 + 角标：角标是挂在图标右上角的独立标记，不占内容流、不参与行宽计算 */}
        <span className={`relative inline-flex shrink-0 ${isCollapsed ? '' : 'mr-3'}`}>
          <item.icon
            className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'}`}
          />
          {showBadge && (
            <span
              className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-800 text-[10px] font-bold text-white"
              aria-hidden="true"
            >
              {pendingTodoCount > 99 ? '99+' : pendingTodoCount}
            </span>
          )}
        </span>
        {!isCollapsed && (
          <span className="w-[4em] shrink-0 whitespace-nowrap text-sm text-left animate-in fade-in duration-150">{item.label}</span>
        )}
      </Link>
    );
  }, [location.pathname, isCollapsed, pendingTodoCount, handleCloseSidebar]);

  return (
    <aside
      className={`relative z-30 bg-white/80 dark:bg-zinc-800/70 backdrop-blur-xl border border-zinc-200/60 dark:border-white/10 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-2xl flex flex-col print:hidden shrink-0 transition duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-48'
      } ${className}`}
    >
      {/* Banner：Logo 与名称上下两行居中。折叠入口做成骑跨侧栏右边框的小圆钮（不占 banner 横向空间）；
          桌面端页眉已移除，此区承担品牌展示 */}
      <div
        className="flex items-center justify-center h-[72px] shrink-0 border-b border-zinc-200/60 dark:border-white/10 transition duration-250"
      >
        <div className={`flex flex-col items-center justify-center min-w-0 ${isCollapsed ? '' : 'w-[124px]'}`}>
          <div className="w-9 h-9 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={systemIcon || DEFAULT_SYSTEM_ICON}
              alt="Logo"
              width={36}
              height={36}
              className={`w-full h-full object-contain ${systemIcon ? 'bg-white dark:bg-zinc-800' : ''}`}
            />
          </div>
          {!isCollapsed && (
            <span className="mt-1 text-base font-bold text-zinc-800 dark:text-white leading-none whitespace-nowrap overflow-hidden animate-in fade-in duration-300">
              AMS 系统
            </span>
          )}
        </div>
      </div>
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="absolute z-40 -right-3 top-[72px] -translate-y-1/2 h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-300/80 dark:border-zinc-600 shadow-sm flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-400 dark:hover:border-brand-500 transition-colors duration-150"
          title={isCollapsed ? '展开菜单' : '收起菜单'}
          aria-label={isCollapsed ? '展开菜单' : '收起菜单'}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}
      {/* Nav（外层 relative 容器承载底部滚动提示箭头） */}
      <div className="relative flex-1 flex flex-col min-h-0">
        <nav ref={navRef} onScroll={updateScrollHint} aria-label="主导航" className="px-3 pt-3 pb-4 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {/* 三区块共用 124px 内容列（banner/导航/账户区左缘同线），列整体居中；角标走绝对定位不撑宽 */}
          <div className={`${isCollapsed ? 'w-max' : 'w-[124px]'} mx-auto space-y-1.5`}>
            {orderedNav.map(renderNavItem)}
          </div>
        </nav>
        {canScrollDown && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 flex items-end justify-center pb-1.5 bg-gradient-to-t from-white via-white/70 to-transparent dark:from-zinc-800 dark:via-zinc-800/70"
          >
            <ChevronDown className="h-4 w-4 text-zinc-400 dark:text-zinc-500 animate-bounce [animation-duration:1.6s]" />
          </div>
        )}
      </div>
      {/* 用户信息底部区（含账户菜单：主题/个人设置/退出登录） */}
      <div className={`border-t border-zinc-200/60 dark:border-zinc-700/60 p-3 shrink-0 ${isCollapsed ? 'flex flex-col items-center gap-1' : ''}`}>
        <UserMenu isCollapsed={isCollapsed} onNavigate={handleCloseSidebar} />
      </div>
    </aside>
  );
});

export default Sidebar;
