import { Permission } from "@/components/Permission";
import React, { useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle, Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import CoverageBanner from './CoverageBanner';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type TableProps = Pick<
  UseAttendanceReturn,
  | 'activeTab'
  | 'searchQuery'
  | 'scheduleSearchQuery'
  | 'setScheduleSearchQuery'
  | 'setEditingShift'
  | 'records'
  | 'schedules'
  | 'anomalies'
  | 'shifts'
  | 'isLoading'
  | 'removeRecord'
  | 'clearRecords'
  | 'removeSchedule'
  | 'clearSchedules'
  | 'deleteShift'
  | 'hasPermission'
  | 'filteredAnomalies'
  | 'filteredSchedules'
  | 'recordsPage'
  | 'setRecordsPage'
  | 'schedulesPage'
  | 'setSchedulesPage'
  | 'ITEMS_PER_PAGE'
>;

export default function Table({
  activeTab,
  scheduleSearchQuery,
  setScheduleSearchQuery,
  setEditingShift,
  records,
  schedules,
  anomalies,
  shifts,
  isLoading,
  removeRecord,
  clearRecords,
  removeSchedule,
  clearSchedules,
  deleteShift,
  hasPermission,
  filteredAnomalies,
  filteredSchedules,
  recordsPage,
  setRecordsPage,
  schedulesPage,
  setSchedulesPage,
  ITEMS_PER_PAGE,
}: TableProps) {
  const confirm = useConfirm();
  const onEditShiftClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const shiftId = e.currentTarget.dataset.shiftid;
      const shift = shifts.find((s) => s.id === shiftId);
      if (shift) {
        setEditingShift(shift);
      }
    },
    [shifts, setEditingShift]
  );

  const onDeleteShiftClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      const shiftId = e.currentTarget.dataset.shiftid;
      if (
        shiftId &&
        (await confirm({ title: '确定要删除这个班次吗？', description: '此操作不可恢复。', variant: 'danger' }))
      ) {
        deleteShift(shiftId);
      }
    },
    [deleteShift, confirm]
  );

  const onRemoveScheduleClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      const employeeId = e.currentTarget.dataset.employeeid;
      if (!employeeId) return;
      const ok = await confirm({
        title: '确定要移除该员工的排班吗？',
        description: '移除后该员工不再按班次判定考勤异常。',
        variant: 'danger',
      });
      if (ok) removeSchedule(employeeId);
    },
    [confirm, removeSchedule]
  );

  // 整表清空对应服务端 DELETE /schedules 与 /records（仅 ADMIN）：
  // 此前它们走 PUT 批量替换，records 传空数组会清库、schedules 传空数组则什么都删不掉。
  const onClearSchedules = useCallback(async () => {
    const ok = await confirm({
      title: `确定要清空全部 ${schedules.length} 条排班吗？`,
      description: '此操作不可恢复，建议先导出花名册留底。',
      variant: 'danger',
    });
    if (ok) clearSchedules();
  }, [confirm, clearSchedules, schedules.length]);

  const onClearRecords = useCallback(async () => {
    const ok = await confirm({
      title: `确定要清空全部 ${records.length} 条打卡记录吗？`,
      description: '月报与异常分析将随之失效，需重新导入打卡数据，此操作不可恢复。',
      variant: 'danger',
    });
    if (ok) clearRecords();
  }, [confirm, clearRecords, records.length]);

  const onRemoveRecordClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.recordid;
      if (!id) return;
      const ok = await confirm({
        title: '确定要删除这条打卡记录吗？',
        description: '删除后需重新导入才能恢复。',
        variant: 'danger',
      });
      if (ok) removeRecord(id);
    },
    [confirm, removeRecord]
  );

  if (activeTab === 'records') {
    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">已导入记录 ({records.length})</h2>
          {records.length > 0 && hasPermission('attendance:purge') && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void onClearRecords()}
              className="h-auto px-0 text-sm text-destructive hover:text-destructive/80"
            >
              清空全部记录
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">工号</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">姓名</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">日期</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">时间</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">来源</th>
                {hasPermission('attendance:manage') && (
                  <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {isLoading ? (
                <TableSkeleton columns={hasPermission('attendance:manage') ? 6 : 5} rows={5} />
              ) : (
                records.slice((recordsPage - 1) * ITEMS_PER_PAGE, recordsPage * ITEMS_PER_PAGE).map((record) => (
                  <tr key={record.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">
                      {record.employeeId}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">
                      {record.employeeName}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                      {record.date}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                      {record.time}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm">
                      {record.source === 'wecom' ? (
                        <Badge variant="primary">企业微信</Badge>
                      ) : (
                        <span className="text-muted-foreground">补卡/导入</span>
                      )}
                    </td>
                    {hasPermission('attendance:manage') && (
                      <td className="px-6 py-2 whitespace-nowrap text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-recordid={record.id}
                          onClick={(e) => void onRemoveRecordClick(e)}
                          // -m-1.5 抵消 28px 按钮盒，避免撑高表格行
                          className="-m-1.5 text-zinc-400 hover:text-destructive"
                          title="删除该条打卡记录"
                          aria-label={`删除打卡记录：${record.employeeName} ${record.date} ${record.time}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={recordsPage}
            totalPages={Math.ceil(records.length / ITEMS_PER_PAGE)}
            totalItems={records.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setRecordsPage}
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'schedules') {
    return (
      <div className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">已导入排班 ({schedules.length})</h2>
          <div className="flex items-center space-x-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="搜索姓名或工号…"
                value={scheduleSearchQuery}
                onChange={(e) => setScheduleSearchQuery(e.target.value)}
                className="w-full pl-10"
              />
            </div>
            {schedules.length > 0 && hasPermission('attendance:purge') && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void onClearSchedules()}
                className="h-auto px-0 text-sm whitespace-nowrap text-destructive hover:text-destructive/80"
              >
                清空全部排班
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">工号</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">姓名</th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">班次</th>
                <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {isLoading ? (
                <TableSkeleton columns={4} rows={5} />
              ) : (
                filteredSchedules.slice((schedulesPage - 1) * ITEMS_PER_PAGE, schedulesPage * ITEMS_PER_PAGE).map((schedule) => (
                  <tr key={schedule.employeeId} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">
                      {schedule.employeeId}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">
                      {schedule.employeeName}
                    </td>
                    <td className="px-6 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {schedule.shiftIds
                        ? schedule.shiftIds.map((id) => {
                            const shift = shifts.find((s) => s.id === id);
                            return shift ? (
                              <span
                                key={id}
                                className="inline-block bg-zinc-100 dark:bg-zinc-700 px-3 py-1 rounded-full text-xs font-medium mr-2 mb-1"
                              >
                                {shift.name}
                              </span>
                            ) : (
                              id
                            );
                          })
                        : 'shiftId' in schedule ? String((schedule as { shiftId?: string }).shiftId) : ''}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <Permission code="attendance:manage">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          data-employeeid={schedule.employeeId}
                          onClick={(e) => void onRemoveScheduleClick(e)}
                          className="h-auto px-0 text-sm text-destructive hover:text-destructive/80"
                          aria-label={`移除排班：${schedule.employeeName}`}
                        >
                          删除
                        </Button>
                      </Permission>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={schedulesPage}
            totalPages={Math.ceil(filteredSchedules.length / ITEMS_PER_PAGE)}
            totalItems={filteredSchedules.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setSchedulesPage}
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'anomalies') {
    return (
      <div className="p-6 flex flex-col h-full">
        <CoverageBanner />
        {anomalies.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <EmptyState
              title="暂无异常数据"
              icon={AlertTriangle}
              description="打卡记录会按部门工作时段自动对班后判定。若还没有任何判定，请到「部门时段」配置各部门上下班时间（或维护排班字典），再点「一键分析异常」。"
            />
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800 rounded-2xl">
            <table className="min-w-[800px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
              <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    日期
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    工号
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    姓名
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    异常类型
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    描述
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
                {isLoading ? (
                  <TableSkeleton columns={5} rows={5} />
                ) : (
                  filteredAnomalies.map((anomaly) => (
                    <tr key={anomaly.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-200">
                        {anomaly.date}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {anomaly.employeeId}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-200">
                        {anomaly.employeeName}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 inline-flex text-xs font-medium rounded-full ${
                            (anomaly.type || '').includes('LATE')
                              ? 'bg-warning/10 text-warning'
                              : (anomaly.type || '').includes('MISSING')
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-warning/10 text-warning'
                          }`}
                        >
                          {anomaly.type === 'LATE_5' && '迟到 > 5分'}
                          {anomaly.type === 'LATE_15' && '迟到 > 15分'}
                          {anomaly.type === 'MISSING_IN' && '上班缺卡'}
                          {anomaly.type === 'MISSING_OUT' && '下班缺卡'}
                          {anomaly.type === 'EARLY_LEAVE' && '早退'}
                        </span>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {anomaly.description}
                      </td>
                    </tr>
                  ))
                )}
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
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  班次名称
                </th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  上班时间
                </th>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  下班时间
                </th>
                {hasPermission('attendance:manage') && (
                  <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {isLoading ? (
                <TableSkeleton columns={hasPermission('attendance:manage') ? 4 : 3} rows={5} />
              ) : (
                shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-6 py-2 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-200">
                      {shift.name}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                      {shift.startTime}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                      {shift.endTime}
                    </td>
                    {hasPermission('attendance:manage') && (
                      <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <Button
                          variant="ghost"
                          size="xs"
                          data-shiftid={shift.id}
                          onClick={onEditShiftClick}
                          className="h-auto px-0 mr-4 text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          data-shiftid={shift.id}
                          onClick={onDeleteShiftClick}
                          className="h-auto px-0 text-sm text-destructive hover:text-destructive/80"
                        >
                          删除
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}
