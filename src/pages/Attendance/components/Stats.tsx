import React from 'react';
import { Users, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type StatsProps = Pick<UseAttendanceReturn, 'records' | 'schedules' | 'anomalies' | 'shifts'>;

export default function Stats({ records, schedules, anomalies, shifts }: StatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg mr-4">
          <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">打卡记录</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{records.length}</p>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg mr-4">
          <Calendar className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">排班记录</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{schedules.length}</p>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg mr-4">
          <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">班次数量</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{shifts.length}</p>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
        <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg mr-4">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">异常考勤</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{anomalies.length}</p>
        </div>
      </div>
    </div>
  );
}
