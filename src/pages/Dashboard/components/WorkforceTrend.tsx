import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { WorkforceStats } from '@/services/statsApi';
import WidgetSizePicker from '@/components/ui/WidgetSizePicker';
import type { WidgetSize } from '@/config/widgetSizes';

interface Props {
  stats: WorkforceStats | null;
  isLoading: boolean;
  size: WidgetSize;
  onSizeChange: (next: WidgetSize) => void;
  editing: boolean;
}

/** 月份标签：2026-09 → 9月 */
function monthLabel(m: string): string {
  const parts = m.split('-');
  return parts[1] ? `${parseInt(parts[1], 10)}月` : m;
}

/** 小档只看最近 3 个月；中/大档用服务端给的完整窗口（6 个月） */
const monthsOf = (size: WidgetSize, all: string[]) => (size === 'small' ? all.slice(-3) : all);

const HEIGHT: Record<WidgetSize, string> = {
  small: 'h-25',
  medium: 'h-35',
  large: 'h-50',
};

/**
 * 人员流动趋势（纯 CSS 分组柱状图——刻意不引入 recharts，避免图表库重新进入主 bundle）。
 *
 * 标题里的月数跟着档位走：小档只画 3 个月却写「近 6 个月」，就是一句错的口径声明。
 */
export default function WorkforceTrend({ stats, isLoading, size, onSizeChange, editing }: Props) {
  const months = stats ? monthsOf(size, stats.months) : [];
  const idxs = months.map((m) => stats?.months.indexOf(m) ?? -1);
  const max = stats ? Math.max(1, ...idxs.map((i) => Math.max(stats.hires[i] ?? 0, stats.departures[i] ?? 0))) : 1;
  const totals = idxs.reduce(
    (acc, i) => ({ hires: acc.hires + (stats?.hires[i] ?? 0), departures: acc.departures + (stats?.departures[i] ?? 0) }),
    { hires: 0, departures: 0 }
  );

  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          人员流动（近 {months.length || stats?.months.length || 0} 个月）
        </h2>
        {editing && <WidgetSizePicker value={size} onChange={onSizeChange} />}
        {!editing && stats && size !== 'small' && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
        <div className={`${HEIGHT[size]} animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg`} />
      ) : (
        <>
          <div className={`flex items-end justify-between gap-2 ${HEIGHT[size]}`}>
            {months.map((m, k) => {
              const i = idxs[k];
              return (
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
                  <span className="text-2xs text-muted-foreground">{monthLabel(m)}</span>
                </div>
              );
            })}
          </div>
          {/* 数值行（扫读对比）：小档宽度不够，藏掉 */}
          {size !== 'small' && (
            <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              {months.map((m, k) => {
                const i = idxs[k];
                return (
                  <div key={m} className="flex-1 text-center text-2xs tabular-nums text-muted-foreground">
                    <span className="text-emerald-700 dark:text-emerald-400">{stats.hires[i]}</span>
                    {' / '}
                    <span className="text-rose-600 dark:text-rose-400">{stats.departures[i]}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* 大档才给区间合计：柱高已经拉大，多一行不挤 */}
          {size === 'large' && (
            <p className="mt-2 text-2xs text-muted-foreground text-right tabular-nums">
              近 {months.length} 个月合计：入职 {totals.hires} · 离职 {totals.departures}
            </p>
          )}
        </>
      )}
    </div>
  );
}
