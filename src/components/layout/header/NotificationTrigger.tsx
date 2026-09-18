import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useNotificationStore } from '@/store/useNotificationStore';
import NotificationPanel from './NotificationPanel';

export default function NotificationTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);

  // 通知改为服务端数据源：挂载时拉取未读数（Header 仅在登录后渲染）
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggleOpen}
        className="p-2 text-zinc-400 hover:text-zinc-500 dark:hover:text-zinc-300 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors duration-200 relative"
        aria-label={unreadCount > 0 ? `通知，${unreadCount}条未读` : '通知'}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-0.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-800 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>{isOpen && <NotificationPanel onClose={handleClose} />}</AnimatePresence>
    </div>
  );
}
