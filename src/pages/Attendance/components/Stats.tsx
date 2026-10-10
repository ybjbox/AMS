import React from 'react';
import { AlertTriangle, Clock, Users, CalendarDays } from 'lucide-react';
import { UseAttendanceReturn } from '../hooks/useAttendance';

/**
 * 四张卡：打卡 / 覆盖人数 / 部门时段 / 异常考勤。
 *
 * 原先第二、三张是「排班记录」「班次数量」，而这两页已撤（2026-10-10）——
 * 统计里留着它们会一直显示 0 和 1，比没有更让人以为哪里没配好。
 */
export type StatsProps = Pick<UseAttendanceReturn, 'records' | 'anomalies'> & {
  /** 部门时段条数：不再是「班次数量」，而是真正生效的口径条数 */
  shiftRuleCount: number;
  /** 有打卡的人次（人·日），比「打卡条数」更贴近出勤口径 */
  punchDays: number;
};

export default function Stats({ records, anomalies, shiftRuleCount, punchDays }: StatsProps) {
  const items = [
    { label: '打卡记录', value: records.length, icon: Clock, bg: 'bg-brand-50 dark:bg-brand-900/30', color: 'text-brand-600 dark:text-brand-400' },
    { label: '出勤人次', value: punchDays, icon: Users, bg: 'bg-brand-50 dark:bg-brand-900/30', color: 'text-brand-600 dark:text-brand-400' },
    { label: '部门时段', value: shiftRuleCount, icon: CalendarDays, bg: 'bg-amber-50 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-400' },
    { label: '异常考勤', value: anomalies.length, icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {items.map((item) => (
        <div key={item.label} className="card-base card-lift p-6 flex flex-col justify-between min-h-[120px]">
          <div className={`rounded-2xl flex items-center justify-center w-12 h-12 ${item.bg} mb-3`}>
            <item.icon className={`h-6 w-6 ${item.color}`} />
          </div>
          <div>
            <div className="text-zinc-600 dark:text-zinc-400 font-medium text-sm mb-1">{item.label}</div>
            <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white [font-variant-numeric:tabular-nums]">
              {item.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
