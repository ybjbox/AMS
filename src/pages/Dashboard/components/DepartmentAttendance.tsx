import React from 'react';
import { Gauge } from 'lucide-react';
import type { AttendanceStats } from '@/services/statsApi';
import WidgetSizePicker from '@/components/ui/WidgetSizePicker';
import { resolveListDensity, type WidgetSize } from '@/config/widgetSizes';

interface Props {
  stats: AttendanceStats | null;
  isLoading: boolean;
  size: WidgetSize;
  onSizeChange: (next: WidgetSize) => void;
  editing: boolean;
}

/**
 * 部门出勤率排名（近 30 天，纯 CSS 横向条形图——不引入图表库）。
 *
 * 口径与考勤管理一致：按部门工作时段自动对班，
 * 「出勤人日」= 当天对上班的班次数，「应出勤人日」= 当天有适用时段且非请假的次数。
 *
 * 档位：小 = 前 3 名（藏掉口径长句），中 = 前 5 名，大 = 全部并展开「出勤/应出勤」明细。
 */
export default function DepartmentAttendance({ stats, isLoading, size, onSizeChange, editing }: Props) {
  const density = resolveListDensity(size);
  const rates = stats?.departmentRates ?? [];
  const max = rates.length ? Math.max(...rates.map((r) => r.rate), 100) : 100;
  const shown = rates.slice(0, density.rows);
  const hidden = rates.length - shown.length;
  const totals = rates.reduce(
    (acc, r) => ({ attended: acc.attended + r.attended, expected: acc.expected + r.expected }),
    { attended: 0, expected: 0 }
  );

  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          部门出勤率（近 30 天）
        </h2>
        {editing && <WidgetSizePicker value={size} onChange={onSizeChange} />}
      </div>
      {density.showMeta && (
        <p className="text-2xs text-muted-foreground mb-4">
          按部门工作时段自动对班：出勤人日 ÷ 应出勤人日（请假日不计）
          {stats?.ratedFrom && stats?.ratedTo && stats.ratedTo !== stats.ratedFrom ? (
            <>，统计 {stats.ratedFrom} ~ {stats.ratedTo}</>
          ) : null}
        </p>
      )}

      {isLoading || !stats ? (
        <div className="h-35 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      ) : rates.length === 0 ? (
        <div className="h-35 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <span>暂无出勤率数据</span>
          <span className="text-2xs">需要先在「考勤管理 → 部门时段」给部门配上下班时间</span>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {shown.map((r, idx) => (
              <li key={r.name} className="flex items-center gap-3">
                <span className="w-5 text-right text-xs tabular-nums text-muted-foreground shrink-0">
                  {idx + 1}
                </span>
                <span
                  className="w-20 truncate text-sm text-zinc-700 dark:text-zinc-200 shrink-0"
                  title={`${r.name}：出勤 ${r.attended} 人日 / 应出勤 ${r.expected} 人日`}
                >
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
                {density.showDetail && (
                  <span className="w-20 shrink-0 text-right text-2xs text-muted-foreground tabular-nums">
                    {r.attended} / {r.expected} 人日
                  </span>
                )}
                <span className="w-14 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0">
                  {r.rate}%
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-3 text-2xs text-muted-foreground">
              另有 {hidden} 个部门未排名显示 · 共 {rates.length} 个
            </p>
          )}
          <p className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-2xs text-muted-foreground text-right tabular-nums">
            合计出勤 {totals.attended} 人日 · 应出勤 {totals.expected} 人日
          </p>
        </>
      )}
    </div>
  );
}
