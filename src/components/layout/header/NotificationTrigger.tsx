import { Pressable } from '@/components/ui/Pressable';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useNotificationStore } from '@/store/useNotificationStore';
import NotificationContent from './NotificationContent';

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
      <Pressable
        onClick={toggleOpen}
        className="relative flex size-11 items-center justify-center rounded-full text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
        aria-label={unreadCount > 0 ? `通知，${unreadCount}条未读` : '通知'}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-800 text-3xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Pressable>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-100 dark:border-zinc-700 z-50 transform origin-top-right"
          >
            <NotificationContent onClose={handleClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
