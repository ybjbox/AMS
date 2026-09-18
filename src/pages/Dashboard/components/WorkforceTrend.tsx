import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { WorkforceStats } from '@/services/statsApi';

interface Props {
  stats: WorkforceStats | null;
  isLoading: boolean;
}

/** 月份标签：2026-09 → 9月 */
function monthLabel(m: string): string {
  const parts = m.split('-');
  return parts[1] ? `${parseInt(parts[1], 10)}月` : m;
}

/**
 * 人员流动趋势（近 6 个月，纯 CSS 分组柱状图——刻意不引入 recharts，
 * 避免图表库重新进入主 bundle）。
 */
export default function WorkforceTrend({ stats, isLoading }: Props) {
  const max = stats ? Math.max(1, ...stats.hires, ...stats.departures) : 1;

  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          人员流动（近 6 个月）
        </h2>
        {stats && (
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" aria-hidden="true" /> 入职
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-400" aria-hidden="true" /> 离职
            </span>
          </div>
        )}
      </div>

      {isLoading || !stats ? (
        <div className="h-[140px] animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      ) : (
        <>
          <div className="flex items-end justify-between gap-2 h-[140px]">
            {stats.months.map((m, i) => (
              <div key={m} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="flex items-end gap-1 h-full w-full justify-center">
                  <div
                    className="w-3 sm:w-4 rounded-t bg-emerald-500/90"
                    style={{ height: `${(stats.hires[i] / max) * 100}%`, minHeight: stats.hires[i] > 0 ? '4px' : '0' }}
                    title={`入职 ${stats.hires[i]} 人`}
                    role="img"
                    aria-label={`${monthLabel(m)} 入职 ${stats.hires[i]} 人`}
                  />
                  <div
                    className="w-3 sm:w-4 rounded-t bg-rose-400/90"
                    style={{ height: `${(stats.departures[i] / max) * 100}%`, minHeight: stats.departures[i] > 0 ? '4px' : '0' }}
                    title={`离职 ${stats.departures[i]} 人`}
                    role="img"
                    aria-label={`${monthLabel(m)} 离职 ${stats.departures[i]} 人`}
                  />
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{monthLabel(m)}</span>
              </div>
            ))}
          </div>
          {/* 数值行（扫读对比） */}
          <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {stats.months.map((m, i) => (
              <div key={m} className="flex-1 text-center text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                <span className="text-emerald-700 dark:text-emerald-400">{stats.hires[i]}</span>
                {' / '}
                <span className="text-rose-600 dark:text-rose-400">{stats.departures[i]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
