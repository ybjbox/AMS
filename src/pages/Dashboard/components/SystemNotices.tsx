import React from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UseDashboardReturn } from '../hooks/useDashboard';
import { EmptyState } from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import { useUserStore } from '@/store/useUserStore';

export type SystemNoticesProps = Pick<UseDashboardReturn, 'notices' | 'isLoading'>;

export default function SystemNotices({ notices, isLoading }: SystemNoticesProps) {
  // 「查看全部」入口位于系统设置（ADMIN 专属）：无权限用户仅看控制台展示，不显示入口
  const canManage = useUserStore((state) => state.hasPermission('settings:view'));
  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">系统公告</h2>
        {canManage && (
          <Link
            to="/settings?tab=announcements"
            className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors"
          >
            查看全部
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-700/50 last:border-0 last:pb-0 animate-pulse">
              <div className="w-full">
                <div className="w-3/4 h-5 bg-zinc-200 dark:bg-zinc-700 rounded mb-2"></div>
                <div className="w-1/2 h-4 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : notices.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="暂无系统公告"
          description="有新的公告时会在这里显示"
          className="py-12"
        />
      ) : (
        <div className="space-y-5">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-700/50 last:border-0 last:pb-0 group cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {notice.title}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                  {notice.dept} 发布于 {notice.date}
                </p>
              </div>
              {notice.isNew && (
                <Badge variant="primary">最新</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
