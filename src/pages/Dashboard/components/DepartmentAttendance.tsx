import React from 'react';
import { Gauge } from 'lucide-react';
import type { AttendanceStats } from '@/services/statsApi';

interface Props {
  stats: AttendanceStats | null;
  isLoading: boolean;
}

/**
 * 部门出勤率排名（近 30 天，纯 CSS 横向条形图——不引入图表库）。
 */
export default function DepartmentAttendance({ stats, isLoading }: Props) {
  const rates = stats?.departmentRates ?? [];
  const max = rates.length ? Math.max(...rates.map((r) => r.rate), 100) : 100;

  return (
    <div className="card-base p-6 transition duration-300 hover:shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          部门出勤率（近 30 天）
        </h2>
      </div>

      {isLoading || !stats ? (
        <div className="h-[140px] animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      ) : rates.length === 0 ? (
        <div className="h-[140px] flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
          暂无排班与打卡数据
        </div>
      ) : (
        <ul className="space-y-3">
          {rates.map((r, idx) => (
            <li key={r.name} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs tabular-nums text-zinc-400 dark:text-zinc-500 shrink-0">
                {idx + 1}
              </span>
              <span className="w-20 truncate text-sm text-zinc-700 dark:text-zinc-200 shrink-0" title={r.name}>
                {r.name}
              </span>
              <div className="flex-1 h-5 rounded-md bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-md transition-all duration-500 ${
                    r.rate >= 90 ? 'bg-emerald-500/85' : r.rate >= 75 ? 'bg-lime-400/85' : 'bg-amber-400/85'
                  }`}
                  style={{ width: `${Math.max(2, (r.rate / max) * 100)}%` }}
                />
              </div>
              <span className="w-14 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0">
                {r.rate}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
