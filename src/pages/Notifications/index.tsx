import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight, Inbox } from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import { Pressable } from '@/components/ui/Pressable';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatNotificationTime } from '@/utils/dateUtils';
import type { Notification } from '@/types';
import { notificationTarget } from '@/utils/notificationTarget';

type Filter = 'all' | 'unread';

/** refKey（contract:EMP0027 / probation:EMP0027）→ 可处理的对象页 */
export default function Notifications() {
  useDocumentTitle('通知中心');
  const navigate = useNavigate();
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const isLoading = useNotificationStore((state) => state.isLoading);
  const loadError = useNotificationStore((state) => state.loadError);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const markNotificationAsRead = useNotificationStore((state) => state.markNotificationAsRead);
  const markAllNotificationsAsRead = useNotificationStore((state) => state.markAllNotificationsAsRead);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const visible = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [filter, notifications]
  );
  const shown = visible.slice(0, limit);

  const openNotification = (n: Notification) => {
    markNotificationAsRead(n.id);
    const target = notificationTarget(n);
    if (target) navigate(target);
  };

  const title = filter === 'unread' ? '没有未读通知' : '暂无通知';

  return (
    <PageContainer width="6xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">通知中心</h1>
          <p className="page-subtitle">合同与试用期提醒都在这里；点一条直达要处理的员工</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllNotificationsAsRead}>
            <CheckCheck className="size-4" />
            全部已读
          </Button>
        )}
      </div>

      <div className="card-base overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 dark:border-zinc-700/60">
          <div className="flex gap-1" role="tablist" aria-label="通知筛选">
            {([
              ['all', `全部 ${notifications.length}`],
              ['unread', `未读 ${unreadCount}`],
            ] as const).map(([id, label]) => (
              <Pressable
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => { setFilter(id); setLimit(20); }}
                className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
                  filter === id
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-muted-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {label}
              </Pressable>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <ListSkeleton rows={5} />
            <span className="sr-only">通知加载中</span>
          </div>
        ) : loadError ? (
          <FailedState subject="通知" reason={loadError} onRetry={() => void fetchNotifications()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={filter === 'unread' ? Inbox : Bell}
            title={title}
            description={filter === 'unread' ? '所有通知都看过了。' : '有新的合同或试用期提醒时会出现在这里。'}
            action={
              filter === 'unread' && notifications.length > 0 ? (
                <Button variant="outline" onClick={() => setFilter('all')}>
                  看全部通知
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60" aria-label="通知列表">
            {shown.map((n) => {
              const target = notificationTarget(n);
              return (
                <li key={n.id}>
                  <Pressable
                    onClick={() => openNotification(n)}
                    aria-label={`${n.read ? '已读' : '未读'}：${n.title}${target ? '，打开对应记录' : '，标记已读'}`}
                    className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  >
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${
                        n.read ? 'bg-transparent' : n.type === 'warning' ? 'bg-amber-500' : 'bg-brand-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`flex flex-wrap items-center gap-x-2 text-sm ${
                          n.read ? 'text-muted-foreground' : 'font-medium text-zinc-900 dark:text-white'
                        }`}
                      >
                        {n.title}
                        <span className="text-2xs font-normal tabular-nums text-muted-foreground">
                          {formatNotificationTime(n.time)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {n.message}
                      </span>
                      {target && (
                        <span className="mt-1 inline-flex items-center gap-0.5 text-2xs font-medium text-brand-600 dark:text-brand-400">
                          去处理
                          <ChevronRight className="size-3" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className="mt-1 size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600"
                      aria-hidden="true"
                    />
                  </Pressable>
                </li>
              );
            })}
          </ul>
        )}
        {!isLoading && !loadError && visible.length > limit && (
          <div className="border-t border-zinc-100 p-3 text-center dark:border-zinc-700/60">
            <Button variant="outline" onClick={() => setLimit((n) => n + 20)}>
              加载更多（剩余 {visible.length - limit} 条）
            </Button>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
