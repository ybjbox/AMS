import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { AttendanceStats } from '@/services/statsApi';
import WidgetSizePicker from '@/components/ui/WidgetSizePicker';
import type { WidgetSize } from '@/config/widgetSizes';

interface Props {
  stats: AttendanceStats | null;
  isLoading: boolean;
  size: WidgetSize;
  onSizeChange: (next: WidgetSize) => void;
  editing: boolean;
}

/** 热力等级：按当日异常人数（迟到+早退+缺卡）占判定班次的比例分 4 档 */
function heatLevel(stat: { judged: number; present: number; late: number; early: number; missing: number }): { cls: string; label: string } {
  const issues = stat.late + stat.early + stat.missing;
  if (stat.judged === 0 || (stat.present === 0 && issues === 0)) {
    return { cls: 'bg-zinc-100 dark:bg-zinc-800', label: '无数据' };
  }
  const ratio = issues / Math.max(1, stat.judged);
  if (ratio === 0) return { cls: 'bg-emerald-500/85 hover:bg-emerald-500', label: '全勤' };
  if (ratio <= 0.15) return { cls: 'bg-lime-400/85 hover:bg-lime-400', label: '轻微异常' };
  if (ratio <= 0.35) return { cls: 'bg-amber-400/85 hover:bg-amber-400', label: '异常较多' };
  return { cls: 'bg-rose-500/85 hover:bg-rose-500', label: '异常严重' };
}

function dayLabel(date: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 小档只画最近 14 天（7 列两行），中/大档画服务端给的整月窗口 */
const WINDOW: Record<WidgetSize, { days: number; cols: string }> = {
  small: { days: 14, cols: 'grid-cols-7' },
  medium: { days: 30, cols: 'grid-cols-15' },
  large: { days: 30, cols: 'grid-cols-15' },
};

/**
 * 考勤热力图（纯 CSS 网格——不引入图表库）。
 * 颜色越暖表示当日异常（迟到/早退/缺卡）占比越高；悬停/读屏可获取具体数字。
 *
 * 标题里的天数与"灰色格子"那句说明都必须跟着档位走：
 * 小档只画 14 天却写「近 30 天」，读的人会把窗口期算错一倍。
 */
export default function AttendanceHeatmap({ stats, isLoading, size, onSizeChange, editing }: Props) {
  const win = WINDOW[size];
  const days = stats ? stats.days.slice(-win.days) : [];
  const mid = days[Math.floor(days.length / 2)];

  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          考勤热力（近 {days.length || stats?.days.length || 0} 天）
        </h2>
        {editing && <WidgetSizePicker value={size} onChange={onSizeChange} />}
        {!editing && size !== 'small' && (
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span>异常少</span>
            <span className="w-3 h-3 rounded-sm bg-emerald-500/85" aria-hidden="true" />
            <span className="w-3 h-3 rounded-sm bg-lime-400/85" aria-hidden="true" />
            <span className="w-3 h-3 rounded-sm bg-amber-400/85" aria-hidden="true" />
            <span className="w-3 h-3 rounded-sm bg-rose-500/85" aria-hidden="true" />
            <span>异常多</span>
          </div>
        )}
      </div>

      {isLoading || !stats ? (
        <div className="h-19 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      ) : (
        <>
          <div className={`grid ${win.cols} gap-1`} role="img" aria-label={`近 ${days.length} 天考勤热力图`}>
            {days.map((d) => {
              const lv = heatLevel(d);
              return (
                <div
                  key={d.date}
                  className={`aspect-square rounded-sm min-w-0 ${lv.cls} transition-colors`}
                  title={`${d.date}（${lv.label}）：出勤 ${d.present}，迟到 ${d.late}，早退 ${d.early}，缺卡 ${d.missing}${
                    d.unmatched > 0 ? `，未判定 ${d.unmatched}` : ''
                  }`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-2xs text-muted-foreground tabular-nums">
            <span>{dayLabel(days[0]?.date ?? '')}</span>
            {size !== 'small' && <span>{dayLabel(mid?.date ?? '')}</span>}
            <span>今天</span>
          </div>
          {/* 灰色格子是"没打卡数据"，不是"全员正常"——不说出来会被读成一切正常 */}
          {(stats.noDataDays > 0 || stats.noPlanEmployees > 0) && (
            <p className="mt-2 text-2xs text-muted-foreground">
              {stats.noDataDays > 0 && (
                <>
                  近 {win.days} 天有 {stats.noDataDays} 天没有打卡数据
                  {stats.lastPunchDate ? `（最近一次打卡 ${stats.lastPunchDate}）` : ''}，这些天显示为灰色。
                </>
              )}
              {stats.noPlanEmployees > 0 && (
                <>
                  {stats.noDataDays > 0 ? ' ' : ''}
                  另有 {stats.noPlanEmployees} 人所在部门还没配工作时段，不参与判定。
                </>
              )}
            </p>
          )}
          {/* 汇总：小档不放，那一档只想知道"最近这两周有没有事" */}
          {size !== 'small' && (
            <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-center">
              {(() => {
                const total = days.reduce(
                  (acc, d) => ({
                    present: acc.present + d.present,
                    late: acc.late + d.late,
                    early: acc.early + d.early,
                    missing: acc.missing + d.missing,
                  }),
                  { present: 0, late: 0, early: 0, missing: 0 }
                );
                return (
                  <>
                    <div><div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{total.present}</div><div className="text-2xs text-muted-foreground">出勤人次</div></div>
                    <div><div className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{total.late}</div><div className="text-2xs text-muted-foreground">迟到</div></div>
                    <div><div className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{total.early}</div><div className="text-2xs text-muted-foreground">早退</div></div>
                    <div><div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{total.missing}</div><div className="text-2xs text-muted-foreground">缺卡</div></div>
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
