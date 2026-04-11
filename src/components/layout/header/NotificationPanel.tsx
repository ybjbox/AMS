import React, { useCallback } from 'react';
import { Check, Trash2, Bell } from 'lucide-react';
import { motion } from 'motion/react';
import { useTodoStore } from '../../../store/todos';
import { EmptyState } from '../../ui/EmptyState';

const NotificationPanel = React.memo(function NotificationPanel() {
  const notifications = useTodoStore((state) => state.notifications);
  const unreadCount = useTodoStore((state) => state.unreadCount);
  const markNotificationAsRead = useTodoStore((state) => state.markNotificationAsRead);
  const markAllNotificationsAsRead = useTodoStore((state) => state.markAllNotificationsAsRead);
  const clearNotifications = useTodoStore((state) => state.clearNotifications);

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
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 z-50 transform origin-top-right"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">通知</h3>
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
              className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 flex items-center"
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
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                onClick={() => handleMarkAsRead(notification.id)}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4
                    className={`text-sm font-medium ${!notification.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    {notification.title}
                  </h4>
                  <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap ml-2">
                    {new Date(notification.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{notification.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-center">
          <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
            查看全部通知
          </button>
        </div>
      )}
    </motion.div>
  );
});

export default NotificationPanel;
