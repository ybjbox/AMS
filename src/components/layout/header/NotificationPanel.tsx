import React, { useCallback } from 'react';
import { Check, Trash2, Bell } from 'lucide-react';
import { motion } from 'motion/react';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { EmptyState } from '../../ui/EmptyState';

const NotificationPanel = React.memo(function NotificationPanel() {
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const markNotificationAsRead = useNotificationStore((state) => state.markNotificationAsRead);
  const markAllNotificationsAsRead = useNotificationStore((state) => state.markAllNotificationsAsRead);
  const clearNotifications = useNotificationStore((state) => state.clearNotifications);

  const handleMarkAsRead = useCallback(
    (id: string) => {
      markNotificationAsRead(id);
    },
    [markNotificationAsRead]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-100 dark:border-zinc-700 z-50 transform origin-top-right"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-white">通知</h3>
        <div className="flex space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsAsRead}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
            >
              <Check className="h-3 w-3 mr-1" />
              全部已读
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 flex items-center"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              清空
            </button>
          )}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <EmptyState title="暂无通知" description="您目前没有新的通知" icon={Bell} className="p-8" />
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
            {notifications.map((notification) => (
               <div
                key={notification.id}
                className={`relative p-4 pl-5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                onClick={() => handleMarkAsRead(notification.id)}
              >
                <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${
                  notification.type === 'error'   ? 'bg-red-500' :
                  notification.type === 'warning' ? 'bg-amber-500' :
                  notification.type === 'success' ? 'bg-emerald-500' :
                  'bg-blue-500'
                }`} />
                <div className="flex justify-between items-start mb-1">
                  <h4
                    className={`text-sm font-medium ${!notification.read ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}
                  >
                    {notification.title}
                  </h4>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap ml-2">
                    {(() => {
                      const d = new Date(notification.time);
                      const isToday = d.toDateString() === new Date().toDateString();
                      return isToday
                        ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                        : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' +
                          d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                    })()}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{notification.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-700 text-center">
          <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
            查看全部通知
          </button>
        </div>
      )}
    </motion.div>
  );
});

export default NotificationPanel;
