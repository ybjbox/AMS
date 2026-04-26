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
            className="card-base p-6 min-h-[140px] flex flex-col justify-between animate-pulse"
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
      {stats.map((item) => {
        return (
          <div
            key={item.name}
            className="card-base transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between p-6 min-h-[140px]"
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
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
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
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mb-1">{item.name}</h3>
              <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {item.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
