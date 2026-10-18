import React from 'react';
import { Building2 } from 'lucide-react';
import type { WorkforceStats } from '@/services/statsApi';
import WidgetSizePicker from '@/components/ui/WidgetSizePicker';
import { resolveListDensity, type WidgetSize } from '@/config/widgetSizes';

interface Props {
  stats: WorkforceStats | null;
  isLoading: boolean;
  size: WidgetSize;
  onSizeChange: (next: WidgetSize) => void;
  editing: boolean;
}

/**
 * 部门人数分布（纯 CSS 水平条形图）。
 * 展示在职 + 试用期员工按部门聚合的人数；表头那行「在职 · 试用期 · 离职」就是口径，
 * 总数不在这里重复 —— 它是上方「在册员工」那张卡。
 *
 * 档位只改"列几行"（小 3 / 中 5 / 大 全部 + 百分比），被截断时必须写明还有几个没显示。
 */
export default function DepartmentDistribution({ stats, isLoading, size, onSizeChange, editing }: Props) {
  const density = resolveListDensity(size);
  const max = stats ? Math.max(1, ...stats.departments.map((d) => d.count)) : 1;
  const all = stats?.departments ?? [];
  const shown = all.slice(0, density.rows);
  const hidden = all.length - shown.length;
  const total = all.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          部门人数分布
        </h2>
        {editing && <WidgetSizePicker value={size} onChange={onSizeChange} />}
        {density.showMeta && stats && !editing && (
          <span className="text-xs text-muted-foreground tabular-nums">
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
        <>
          <div className="space-y-3">
            {shown.map((d) => (
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
                {/* 大档才展开占比：小档宽度不够，多一列会把条挤没 */}
                {density.showDetail && (
                  <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {total > 0 ? `${Math.round((d.count / total) * 100)}%` : '—'}
                  </span>
                )}
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <p className="mt-3 text-2xs text-muted-foreground">
              另有 {hidden} 个部门未显示 · 共 {all.length} 个
            </p>
          )}
        </>
      )}
    </div>
  );
}
