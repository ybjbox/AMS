import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/useUserStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { authService } from '@/services/auth';
import { DEFAULT_USER_AVATAR } from '@/config/constants';
import ThemeToggle from './header/ThemeToggle';
import NotificationContent from './header/NotificationContent';
import { getRoleDisplayName } from '@/utils/roleUtils';
import BackendStatusIndicator from '@/components/BackendStatusIndicator';

/** 按账号隔离前会残留的本地缓存（P1-8）：登出时统一清除 */
const LOCAL_CACHE_KEYS = ['todo-storage', 'ams-notifications', 'ams_permissions', 'contract-storage'];

/**
 * 侧边栏底部账户区：点击账户行弹出向上展开的菜单（通知 / 主题设置 / 设置入口 / 退出登录）。
 * 桌面端无独立铃铛入口——未读数挂在头像角标上，通知列表收纳进本菜单（NotificationContent）。
 */
export default function UserMenu({
  isCollapsed = false,
  onNavigate,
}: {
  isCollapsed?: boolean;
  onNavigate?: () => void;
}) {
  const userInfo = useUserStore((s) => s.userInfo);
  const logout = useUserStore((s) => s.logout);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const notifications = useNotificationStore((s) => s.notifications);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

  // 铃铛入口移除后，本组件是桌面端通知数据的拉取点
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const toggleMenu = useCallback(() => setIsOpen((prev) => !prev), []);

  // 管理员打开的是完整设置页（含权限矩阵等），员工只可见个人/外观面板——标签随角色区分
  const role = (userInfo?.role ?? '').toUpperCase();
  const settingsLabel = role === 'SUPER_ADMIN' || role === 'ADMIN' ? '系统设置' : '个人设置';

  const handleLogout = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      setIsOpen(false);
      // 先吊销服务端会话；失败（如网络断开/会话已过期）也继续本地登出
      try {
        await authService.logout();
      } catch {
        /* 忽略服务端登出错误 */
      }
      LOCAL_CACHE_KEYS.forEach((k) => localStorage.removeItem(k));
      logout();
      navigate('/login');
    },
    [logout, navigate]
  );

  const unreadBadge = unreadCount > 0 && (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-0.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-800 text-[10px] font-bold text-white">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );

  // 优先展示可自助维护的「显示名称」，未设置时回退登录用户名
  const preferredName = userInfo?.displayName?.trim() || userInfo?.username || '';
  // 未上传头像时使用默认头像（品牌蓝人像）
  const avatarSrc = userInfo?.avatar || DEFAULT_USER_AVATAR;

  const avatarCircle = (size: string) => (
    <div className={`${size} rounded-full overflow-hidden bg-brand-100 dark:bg-brand-900/50 ring-1 ring-black/5 dark:ring-white/10 shrink-0`}>
      <img src={avatarSrc} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );

  const avatar = (size: string) => (
    <div className={`relative ${size} shrink-0`}>
      {avatarCircle(size)}
      {unreadBadge}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      {isCollapsed ? (
        <button
          onClick={toggleMenu}
          aria-expanded={isOpen}
          aria-label={unreadCount > 0 ? `账户菜单，${unreadCount} 条未读通知` : '账户菜单'}
          title={preferredName || '用户'}
          className="relative w-9 h-9 rounded-full hover:ring-2 hover:ring-brand-500/40 transition"
        >
          {avatarCircle('w-9 h-9')}
          {unreadBadge}
        </button>
      ) : (
        <>
          {/* 账户区与侧栏 banner/导航共用 124px 内容列（左缘同线），头像与导航图标同轴 */}
          <button
            onClick={toggleMenu}
            aria-expanded={isOpen}
            aria-label={unreadCount > 0 ? `账户菜单，${unreadCount} 条未读通知` : '账户菜单'}
            className="w-[124px] mx-auto flex items-center gap-1.5 px-2.5 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer group text-left"
          >
            {avatar('w-7 h-7')}
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                {preferredName || '用户'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {getRoleDisplayName(userInfo?.role)}
              </p>
            </div>
          </button>
          <div className="w-[124px] mx-auto pt-1.5 flex items-center justify-center">
            <BackendStatusIndicator variant="bare" className="scale-90" />
          </div>
        </>
      )}

      {/* 向上弹出的账户菜单 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute z-50 bg-white dark:bg-zinc-700 rounded-xl border border-zinc-300/80 dark:border-zinc-500/70 ring-1 ring-black/5 dark:ring-white/10 shadow-[0_12px_36px_-10px_rgba(24,24,27,0.35)] overflow-hidden ${
              isCollapsed
                ? 'left-full bottom-0 ml-2 w-52 origin-bottom-left'
                : 'left-0 right-0 bottom-full mb-2 origin-bottom-left'
            }`}
          >
            <div className="py-1">
              {/* 通知收纳：桌面端无独立铃铛，未读列表直接进本菜单（仅有通知时显示） */}
              {notifications.length > 0 && (
                <div className="border-b border-zinc-100 dark:border-zinc-700">
                  <NotificationContent onClose={() => setIsOpen(false)} />
                </div>
              )}
              <ThemeToggle />
              <Link
                to="/settings"
                onClick={() => {
                  setIsOpen(false);
                  onNavigate?.();
                }}
                className="block px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-700/50 transition-colors duration-200"
              >
                {settingsLabel}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-zinc-100 dark:border-zinc-700 transition-colors duration-200"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
