import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Trash2, Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/useNotificationStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatNotificationTime } from '@/utils/dateUtils';

interface NotificationContentProps {
  /** 「查看全部通知」跳转后回调（供宿主关闭所在弹层） */
  onClose?: () => void;
}

/**
 * 通知面板的正文（标题行 + 列表 + 底部入口），不含弹层定位外壳。
 * 两处宿主复用：NotificationPanel（移动端页眉铃铛）、UserMenu 账户弹窗（桌面端通知收纳于此）。
 * 按窄容器（~168px 账户弹窗）设计：操作为纯图标按钮，标题/内容单行截断。
 */
const NotificationContent = React.memo(function NotificationContent({ onClose }: NotificationContentProps) {
  const navigate = useNavigate();
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

  // 未读点颜色 = 通知级别；已读不显示点
  const dotColor = (type?: string) =>
    type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-brand-500';

  return (
    <div className="text-left">
      <div className="flex items-center justify-between pl-3 pr-1.5 py-1.5 border-b border-zinc-100 dark:border-zinc-600/60">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-white">
          通知
          {unreadCount > 0 && (
            <span className="px-1.5 h-4 flex items-center rounded-full bg-red-500 text-3xs font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </h3>
        <div className="flex items-center">
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsAsRead}
              title="全部已读"
              aria-label="全部已读"
              className="p-1.5 rounded-md text-zinc-400 dark:text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-600/60 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              title="清空全部"
              aria-label="清空全部"
              className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-600/60 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto">
        {notifications.length === 0 ? (
          <EmptyState title="暂无通知" description="您目前没有新的通知" icon={Bell} className="p-4" />
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleMarkAsRead(notification.id)}
              className="w-full text-left px-3 py-2 border-b border-zinc-50 dark:border-zinc-600/40 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-600/40 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${notification.read ? 'bg-transparent' : dotColor(notification.type)}`}
                  aria-hidden="true"
                />
                <h4
                  className={`flex-1 min-w-0 truncate text-xs ${
                    notification.read
                      ? 'text-zinc-400 dark:text-zinc-500'
                      : 'text-zinc-800 dark:text-zinc-100 font-medium'
                  }`}
                >
                  {notification.title}
                </h4>
                <span className="text-3xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  {formatNotificationTime(notification.time)}
                </span>
              </div>
              <p className={`mt-0.5 pl-3 text-2xs leading-snug truncate ${notification.read ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {notification.message}
              </p>
            </button>
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="py-1.5 border-t border-zinc-100 dark:border-zinc-600/60 text-center">
          <button
            onClick={() => {
              navigate('/settings?tab=logs');
              onClose?.();
            }}
            className="px-3 py-1 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors"
          >
            查看全部通知
          </button>
        </div>
      )}
    </div>
  );
});

export default NotificationContent;
