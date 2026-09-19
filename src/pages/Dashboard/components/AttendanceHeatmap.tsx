import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { AttendanceStats } from '@/services/statsApi';

interface Props {
  stats: AttendanceStats | null;
  isLoading: boolean;
}

/** 热力等级：按当日异常人数（迟到+早退+缺卡）占比分 4 档 */
function heatLevel(stat: { present: number; late: number; early: number; missing: number; scheduled: number }): { cls: string; label: string } {
  const issues = stat.late + stat.early + stat.missing;
  if (stat.scheduled === 0 || (stat.present === 0 && issues === 0)) {
    return { cls: 'bg-zinc-100 dark:bg-zinc-800', label: '无数据' };
  }
  const ratio = issues / Math.max(1, stat.scheduled);
  if (ratio === 0) return { cls: 'bg-emerald-500/85 hover:bg-emerald-500', label: '全勤' };
  if (ratio <= 0.15) return { cls: 'bg-lime-400/85 hover:bg-lime-400', label: '轻微异常' };
  if (ratio <= 0.35) return { cls: 'bg-amber-400/85 hover:bg-amber-400', label: '异常较多' };
  return { cls: 'bg-rose-500/85 hover:bg-rose-500', label: '异常严重' };
}

function dayLabel(date: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 考勤热力图（近 30 天，纯 CSS 网格——不引入图表库）。
 * 颜色越暖表示当日异常（迟到/早退/缺卡）占比越高；悬停/读屏可获取具体数字。
 */
export default function AttendanceHeatmap({ stats, isLoading }: Props) {
  return (
    <div className="card-base p-6 transition duration-250 hover:shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          考勤热力（近 30 天）
        </h2>
        <div className="flex items-center gap-2 text-2xs text-zinc-500 dark:text-zinc-400">
          <span>异常少</span>
          <span className="w-3 h-3 rounded-sm bg-emerald-500/85" aria-hidden="true" />
          <span className="w-3 h-3 rounded-sm bg-lime-400/85" aria-hidden="true" />
          <span className="w-3 h-3 rounded-sm bg-amber-400/85" aria-hidden="true" />
          <span className="w-3 h-3 rounded-sm bg-rose-500/85" aria-hidden="true" />
          <span>异常多</span>
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="h-[76px] animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
      ) : (
        <>
          <div className="grid grid-cols-15 gap-1" role="img" aria-label="近 30 天考勤热力图">
            {stats.days.map((d) => {
              const lv = heatLevel(d);
              return (
                <div
                  key={d.date}
                  className={`aspect-square rounded-sm min-w-0 ${lv.cls} transition-colors`}
                  title={`${d.date}（${lv.label}）：出勤 ${d.present}，迟到 ${d.late}，早退 ${d.early}，缺卡 ${d.missing}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-2xs text-zinc-400 dark:text-zinc-500 tabular-nums">
            <span>{dayLabel(stats.days[0]?.date ?? '')}</span>
            <span>{dayLabel(stats.days[Math.floor(stats.days.length / 2)]?.date ?? '')}</span>
            <span>今天</span>
          </div>
          {/* 汇总 */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-center">
            {(() => {
              const total = stats.days.reduce(
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
                  <div><div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{total.present}</div><div className="text-2xs text-zinc-500 dark:text-zinc-400">出勤人次</div></div>
                  <div><div className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">{total.late}</div><div className="text-2xs text-zinc-500 dark:text-zinc-400">迟到</div></div>
                  <div><div className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{total.early}</div><div className="text-2xs text-zinc-500 dark:text-zinc-400">早退</div></div>
                  <div><div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{total.missing}</div><div className="text-2xs text-zinc-500 dark:text-zinc-400">缺卡</div></div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
