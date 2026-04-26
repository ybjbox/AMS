import React from 'react';
import { Users, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type StatsProps = Pick<UseAttendanceReturn, 'records' | 'schedules' | 'anomalies' | 'shifts'>;

export default function Stats({ records, schedules, anomalies, shifts }: StatsProps) {
  const items = [
    { label: '打卡记录', value: records.length, icon: Clock, bg: 'bg-blue-50 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-400' },
    { label: '排班记录', value: schedules.length, icon: Calendar, bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: '班次数量', value: shifts.length, icon: Users, bg: 'bg-amber-50 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-400' },
    { label: '异常考勤', value: anomalies.length, icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {items.map((item) => (
        <div key={item.label} className="card-base p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-md hover:-translate-y-0.5" style={{ minHeight: '120px' }}>
          <div className={`rounded-2xl flex items-center justify-center w-12 h-12 ${item.bg} mb-3`}>
            <item.icon className={`h-6 w-6 ${item.color}`} />
          </div>
          <div>
            <h3 className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mb-1">{item.label}</h3>
            <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {item.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
