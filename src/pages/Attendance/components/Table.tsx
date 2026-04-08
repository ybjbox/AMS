import React, { useMemo, useCallback } from 'react';
import { useConfirm } from '../../../hooks/useConfirm';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle, Search } from 'lucide-react';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type TableProps = Pick<UseAttendanceReturn, 
  'activeTab' | 'searchQuery' | 'scheduleSearchQuery' | 'setScheduleSearchQuery' | 
  'setEditingShift' | 'records' | 'schedules' | 'anomalies' | 'shifts' | 
  'isLoading' | 'setRecords' | 'setSchedules' | 'deleteShift' | 'hasPermission' |
  'filteredAnomalies' | 'filteredSchedules'
>;

export default function Table({
  activeTab,
  searchQuery,
  scheduleSearchQuery,
  setScheduleSearchQuery,
  setEditingShift,
  records,
  schedules,
  anomalies,
  shifts,
  isLoading,
  setRecords,
  setSchedules,
  deleteShift,
  hasPermission,
  filteredAnomalies,
  filteredSchedules
}: TableProps) {
  const confirm = useConfirm();
  const onEditShiftClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const shiftId = e.currentTarget.dataset.shiftid;
    const shift = shifts.find(s => s.id === shiftId);
    if (shift) {
      setEditingShift(shift);
    }
  }, [shifts, setEditingShift]);

  const onDeleteShiftClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    const shiftId = e.currentTarget.dataset.shiftid;
    if (shiftId && await confirm({ title: '确定要删除这个班次吗？', description: '此操作不可恢复。', variant: 'danger' })) {
      deleteShift(shiftId);
    }
  }, [deleteShift, confirm]);

  const onRemoveScheduleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const indexStr = e.currentTarget.dataset.index;
    if (indexStr !== undefined) {
      const index = parseInt(indexStr, 10);
      const newSchedules = [...schedules];
      newSchedules.splice(index, 1);
      setSchedules(newSchedules);
    }
  }, [schedules, setSchedules]);

  if (activeTab === 'records') {
    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">已导入记录 ({records.length})</h3>
          {records.length > 0 && hasPermission('attendance:manage') && (
            <button
              onClick={() => setRecords([])}
              className="text-sm text-destructive hover:text-destructive/80 transition-colors"
            >
              清空记录
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">工号</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">姓名</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">日期</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">时间</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {isLoading ? (
                <TableSkeleton columns={4} rows={5} />
              ) : records.slice(0, 50).map((record) => (
                <tr key={record.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">{record.employeeId}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">{record.employeeName}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{record.date}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{record.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length > 50 && (
            <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800">
              仅显示前 50 条记录
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeTab === 'schedules') {
    return (
      <div className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">已导入排班 ({schedules.length})</h3>
          <div className="flex items-center space-x-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="搜索姓名或工号..."
                value={scheduleSearchQuery}
                onChange={(e) => setScheduleSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
              />
            </div>
            {schedules.length > 0 && hasPermission('attendance:manage') && (
              <button
                onClick={() => setSchedules([])}
                className="text-sm text-destructive hover:text-destructive/80 whitespace-nowrap transition-colors"
              >
                清空排班
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">工号</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">姓名</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">班次</th>
                <th className="px-6 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {isLoading ? (
                <TableSkeleton columns={4} rows={5} />
              ) : filteredSchedules.slice(0, 50).map((schedule, idx) => (
                <tr key={idx} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">{schedule.employeeId}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">{schedule.employeeName}</td>
                  <td className="px-6 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {schedule.shiftIds ? schedule.shiftIds.map(id => {
                      const shift = shifts.find(s => s.id === id);
                      return shift ? <span key={id} className="inline-block bg-zinc-100 dark:bg-zinc-700 px-3 py-1 rounded-full text-xs font-medium mr-2 mb-1">{shift.name}</span> : id;
                    }) : (schedule as any).shiftId}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                    {hasPermission('attendance:manage') && (
                      <button
                        data-index={idx}
                        onClick={onRemoveScheduleClick}
                        className="text-destructive hover:text-destructive/80 transition-colors"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'anomalies') {
    return (
      <div className="p-6 flex flex-col h-full">
        {anomalies.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <EmptyState
              title="暂无异常数据"
              description="请先导入打卡记录和排班字典，然后点击'一键分析异常'"
              icon={AlertTriangle}
            />
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800 rounded-2xl">
            <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
              <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">日期</th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">工号</th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">姓名</th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">异常类型</th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">描述</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
                {isLoading ? (
                  <TableSkeleton columns={5} rows={5} />
                ) : filteredAnomalies.map((anomaly) => (
                  <tr key={anomaly.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">{anomaly.date}</td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{anomaly.employeeId}</td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-200">{anomaly.employeeName}</td>
                    <td className="px-6 py-2 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs font-medium rounded-full ${
                        (anomaly.type || '').includes('LATE') ? 'bg-warning/10 text-warning' :
                        (anomaly.type || '').includes('MISSING') ? 'bg-destructive/10 text-destructive' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {anomaly.type === 'LATE_5' && '迟到 > 5分'}
                        {anomaly.type === 'LATE_15' && '迟到 > 15分'}
                        {anomaly.type === 'MISSING_IN' && '上班缺卡'}
                        {anomaly.type === 'MISSING_OUT' && '下班缺卡'}
                        {anomaly.type === 'EARLY_LEAVE' && '早退'}
                      </span>
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{anomaly.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'shifts') {
    return (
      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">班次名称</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">上班时间</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">下班时间</th>
                {hasPermission('attendance:manage') && (
                  <th className="px-6 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">操作</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {isLoading ? (
                <TableSkeleton columns={hasPermission('attendance:manage') ? 4 : 3} rows={5} />
              ) : shifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                  <td className="px-6 py-2 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-200">{shift.name}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{shift.startTime}</td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{shift.endTime}</td>
                  {hasPermission('attendance:manage') && (
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        data-shiftid={shift.id}
                        onClick={onEditShiftClick}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mr-4 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        data-shiftid={shift.id}
                        onClick={onDeleteShiftClick}
                        className="text-destructive hover:text-destructive/80 transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}
