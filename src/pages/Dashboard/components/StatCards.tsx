import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { UseDashboardReturn } from '../hooks/useDashboard';

export type StatCardsProps = Pick<UseDashboardReturn, 'stats' | 'isLoading'>;

export default function StatCards({ stats, isLoading }: StatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="card-base p-6 min-h-[120px] sm:min-h-[140px] flex flex-col justify-between animate-pulse"
          >
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-zinc-200 dark:bg-zinc-700"></div>
              <div className="w-16 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700"></div>
            </div>
            <div className="mt-auto">
              <div className="w-20 h-4 bg-zinc-200 dark:bg-zinc-700 rounded mb-2"></div>
              <div className="w-24 h-8 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {stats.map((item, i) => {
        return (
          <div
            key={item.name}
            /* 数字卡入场：40ms 级联（低频汇总页的 group entrance，总量 <160ms） */
            className="card-base card-lift cursor-default flex flex-col justify-between p-6 min-h-[120px] sm:min-h-[140px] animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex justify-between items-start">
              <div
                className={`rounded-2xl flex items-center justify-center w-12 h-12 ${item.bg}`}
              >
                <item.icon className={`h-6 w-6 ${item.color}`} />
              </div>

              {item.trend !== 'neutral' && (
                <div
                  className={`flex items-center text-sm font-bold px-3 py-1 rounded-full ${
                    item.trend === 'up'
                      ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                  }`}
                >
                  {item.trend === 'up' ? (
                    <ArrowUpRight className="h-4 w-4 mr-0.5 stroke-[3]" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 mr-0.5 stroke-[3]" />
                  )}
                  {item.change}
                </div>
              )}
            </div>

            <div className="mt-auto">
              <div className="text-zinc-600 dark:text-zinc-400 font-medium text-sm mb-1">{item.name}</div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white [font-variant-numeric:tabular-nums]">
                {item.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
