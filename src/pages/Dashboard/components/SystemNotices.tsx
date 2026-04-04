import React from 'react';
import { UseDashboardReturn } from '../hooks/useDashboard';

export type SystemNoticesProps = Pick<UseDashboardReturn, 'notices'>;

export default function SystemNotices({ notices }: SystemNoticesProps) {
  return (
    <div className="bg-white dark:bg-zinc-800 shadow-sm rounded-3xl p-8 lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-zinc-800 dark:text-white tracking-tight">系统公告</h2>
        <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">查看全部</button>
      </div>
      <div className="space-y-5">
        {notices.map((notice, i) => (
          <div key={i} className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-700/50 last:border-0 last:pb-0 group cursor-pointer">
            <div>
              <p className="text-base font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {notice.title}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
                {notice.dept} 发布于 {notice.date}
              </p>
            </div>
            {notice.isNew && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                最新
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
