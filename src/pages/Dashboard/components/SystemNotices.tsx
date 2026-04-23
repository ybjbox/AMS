import React from 'react';
import { Bell } from 'lucide-react';
import { UseDashboardReturn } from '../hooks/useDashboard';

export type SystemNoticesProps = Pick<UseDashboardReturn, 'notices' | 'isLoading'>;

export default function SystemNotices({ notices, isLoading }: SystemNoticesProps) {
  return (
    <div className="card-base p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">系统公告</h2>
        <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">
          查看全部
        </button>
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
        <div className="flex flex-col items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
          <Bell className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium">暂无系统公告</p>
          <p className="text-xs mt-1">有新的公告时会在这里显示</p>
        </div>
      ) : (
        <div className="space-y-5">
          {notices.map((notice, i) => (
            <div
              key={i}
              className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-700/50 last:border-0 last:pb-0 group cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {notice.title}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                  {notice.dept} 发布于 {notice.date}
                </p>
              </div>
              {notice.isNew && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  最新
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
