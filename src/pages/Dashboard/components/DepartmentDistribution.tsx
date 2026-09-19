import React from 'react';
import { Building2 } from 'lucide-react';
import type { WorkforceStats } from '@/services/statsApi';

interface Props {
  stats: WorkforceStats | null;
  isLoading: boolean;
}

/**
 * 部门人数分布（纯 CSS 水平条形图）。
 * 展示在职 + 试用期员工按部门聚合的人数（含状态分布脚注）。
 */
export default function DepartmentDistribution({ stats, isLoading }: Props) {
  const max = stats ? Math.max(1, ...stats.departments.map((d) => d.count)) : 1;
  const total = stats ? Object.entries(stats.statuses).reduce((s, [, v]) => s + v, 0) : 0;

  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          部门人数分布
        </h2>
        {stats && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            在职 {stats.statuses['在职'] ?? 0} · 试用期 {stats.statuses['试用期'] ?? 0}
            {(stats.statuses['离职'] ?? 0) > 0 ? ` · 离职 ${stats.statuses['离职']}` : ''}
          </span>
        )}
      </div>

      {isLoading || !stats ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {stats.departments.map((d) => (
            <div key={d.name} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-zinc-600 dark:text-zinc-300 truncate" title={d.name}>
                {d.name}
              </span>
              <div className="flex-1 h-5 rounded bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded bg-slate-500/80 dark:bg-slate-400/80 transition-[width] duration-500"
                  style={{ width: `${(d.count / max) * 100}%` }}
                  role="img"
                  aria-label={`${d.name} ${d.count} 人`}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-medium text-zinc-700 dark:text-zinc-200 tabular-nums">
                {d.count}
              </span>
            </div>
          ))}
          {total > 0 && (
            <p className="text-2xs text-zinc-400 dark:text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              共 {total} 名在册员工（不含离职）
            </p>
          )}
        </div>
      )}
    </div>
  );
}
