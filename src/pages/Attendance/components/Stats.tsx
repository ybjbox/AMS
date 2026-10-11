import React from 'react';
import { Clock, Users, CalendarDays, TriangleAlert } from 'lucide-react';

export interface StatsProps {
  recordCount: number;
  punchDays: number;
  shiftRuleCount: number;
  anomalyCount: number;
  /** 打卡卡上"出勤人次"是否已收窄到当前筛选条件 */
  punchDaysFiltered: boolean;
}

/**
 * 四条指标压成一条紧凑统计带（原来每张卡 120px 高、四张占满一行，
 * 在 200% 缩放的 1370 视口里把真正的内容全挤到折叠线以下）。
 *
 * 数字用 Fira Code + tabular-nums（MASTER.md Typography · numeric），
 * 这样切换筛选条件时数字宽度不变，不会左右跳。
 */
export default function Stats({
  recordCount,
  punchDays,
  shiftRuleCount,
  anomalyCount,
  punchDaysFiltered,
}: StatsProps) {
  const items = [
    { label: '打卡记录', value: recordCount, icon: Clock, tone: 'text-brand-600 dark:text-brand-400', hint: '' },
    {
      label: '出勤人次',
      value: punchDays,
      icon: Users,
      tone: 'text-brand-600 dark:text-brand-400',
      hint: punchDaysFiltered ? '（当前筛选）' : '',
    },
    { label: '部门时段', value: shiftRuleCount, icon: CalendarDays, tone: 'text-amber-700 dark:text-amber-400', hint: '' },
    { label: '异常考勤', value: anomalyCount, icon: TriangleAlert, tone: 'text-red-700 dark:text-red-400', hint: '' },
  ] as const;

  return (
    <div className="card-base divide-y divide-zinc-100 sm:grid sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x dark:divide-zinc-700/60">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 px-4 py-3">
          <item.icon className={`h-4 w-4 shrink-0 ${item.tone}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="truncate text-2xs text-muted-foreground">
              {item.label}
              {item.hint && <span className="text-brand-700 dark:text-brand-300">{item.hint}</span>}
            </div>
            <div className="text-lg font-bold leading-tight text-zinc-900 dark:text-white tabular-nums">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}