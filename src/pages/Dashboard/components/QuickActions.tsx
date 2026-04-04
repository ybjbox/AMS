import React from 'react';
import { UseDashboardReturn } from '../hooks/useDashboard';

export type QuickActionsProps = Pick<UseDashboardReturn, 'quickActions'>;

export default function QuickActions({ quickActions }: QuickActionsProps) {
  return (
    <div className="bg-white dark:bg-zinc-800 shadow-sm rounded-3xl p-8">
      <h2 className="text-xl font-semibold text-zinc-800 dark:text-white mb-6 tracking-tight">快捷操作</h2>
      <div className="grid grid-cols-2 gap-4">
        {quickActions.map((action) => (
          <button 
            key={action.name}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border border-zinc-100 dark:border-zinc-700/50 hover:border-zinc-200 dark:hover:border-zinc-600 hover:shadow-sm transition-all duration-300 hover:-translate-y-0.5 group bg-zinc-50/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800"
          >
            <div className={`p-3.5 rounded-xl ${action.bg} mb-3 transition-transform duration-300 group-hover:scale-110`}>
              <action.icon className={`h-6 w-6 ${action.color}`} />
            </div>
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{action.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
