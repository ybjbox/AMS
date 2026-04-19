import React from 'react';
import { Zap } from 'lucide-react';
import { UseDashboardReturn } from '../hooks/useDashboard';

export type QuickActionsProps = Pick<UseDashboardReturn, 'quickActions' | 'isLoading'>;

export default function QuickActions({ quickActions, isLoading }: QuickActionsProps) {
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 shadow-sm rounded-2xl p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-6 tracking-tight">快捷操作</h2>
      
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center justify-center p-5 rounded-2xl border border-zinc-100 dark:border-zinc-700/50 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-zinc-200 dark:bg-zinc-700 mb-3"></div>
              <div className="w-16 h-4 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : quickActions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
          <Zap className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium">暂无快捷操作</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.name}
              className="flex flex-col items-center justify-center p-5 rounded-2xl border border-zinc-100 dark:border-zinc-700/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 group bg-white dark:bg-zinc-800"
            >
              <div
                className={`p-3.5 rounded-xl ${action.bg} mb-3 transition-transform duration-300 group-hover:scale-110`}
              >
                <action.icon className={`h-6 w-6 ${action.color}`} />
              </div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{action.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
