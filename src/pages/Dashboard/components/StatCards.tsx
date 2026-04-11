import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { UseDashboardReturn } from '../hooks/useDashboard';

export type StatCardsProps = Pick<UseDashboardReturn, 'stats'>;

export default function StatCards({ stats }: StatCardsProps) {
  const getGridClass = (index: number) => {
    switch (index) {
      case 0:
        return 'col-span-2 row-span-2';
      case 1:
        return 'col-span-1 row-span-1';
      case 2:
        return 'col-span-1 row-span-1';
      case 3:
        return 'col-span-2 row-span-1';
      default:
        return 'col-span-1 row-span-1';
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[160px]">
      {stats.map((item, index) => {
        const isLarge = index === 0;

        // Convert bg-blue-600 to from-blue-400 to-blue-700
        const colorBase = item.color.replace('bg-', '').replace('-500', '');
        const gradientClass = `bg-gradient-to-br from-${colorBase}-400 to-${colorBase}-600 shadow-inner`;

        return (
          <div
            key={item.name}
            className={`bg-white dark:bg-zinc-800 rounded-3xl border-none shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between p-4 ${getGridClass(index)}`}
          >
            <div className="flex justify-between items-start">
              <div
                className={`rounded-2xl flex items-center justify-center ${gradientClass} ${isLarge ? 'w-14 h-14' : 'w-12 h-12'}`}
              >
                <item.icon className={`${isLarge ? 'h-7 w-7' : 'h-6 w-6'} drop-shadow-sm`} />
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
              <h3 className="text-zinc-500 dark:text-zinc-400 font-semibold text-sm mb-1">{item.name}</h3>
              <div
                className={`${isLarge ? 'text-5xl md:text-6xl' : 'text-4xl'} font-extrabold tracking-tight text-zinc-900 dark:text-white`}
              >
                {item.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
