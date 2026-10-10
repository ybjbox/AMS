import React, { useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import CoverageBanner from './CoverageBanner';
import { UseAttendanceReturn } from '../hooks/useAttendance';
// store 的写动作不抛异常（失败原因作为返回值），4xx/5xx 也没有全局提示 ——
// 不接住它就会点了删除却毫无反应。统一出口见 saveFailure 的 reportWrite。
import { reportWrite } from '@/store/saveFailure';

export type TableProps = Pick<
  UseAttendanceReturn,
  | 'activeTab'
  | 'records'
  | 'anomalies'
  | 'isLoading'
  | 'removeRecord'
  | 'clearRecords'
  | 'hasPermission'
  | 'filteredAnomalies'
  | 'recordsPage'
  | 'setRecordsPage'
  | 'ITEMS_PER_PAGE'
>;

export default function Table({
  activeTab,
  records,
  anomalies,
  isLoading,
  removeRecord,
  clearRecords,
  hasPermission,
  filteredAnomalies,
  recordsPage,
  setRecordsPage,
  ITEMS_PER_PAGE,
}: TableProps) {
  const confirm = useConfirm();

  const onClearRecords = useCallback(async () => {
    const ok = await confirm({
      title: `确定要清空全部 ${records.length} 条打卡记录吗？`,
      description: '月报与异常分析将随之失效，需重新导入打卡数据，此操作不可恢复。',
      variant: 'danger',
    });
    if (ok) reportWrite(await clearRecords(), '已清空全部打卡记录');
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
      if (ok) reportWrite(await removeRecord(id), '已删除该条打卡记录');
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
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-muted-foreground">
                      {record.date}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-sm text-muted-foreground">
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

  if (activeTab === 'anomalies') {
    return (
      <div className="p-6 flex flex-col h-full">
        <CoverageBanner />
        {anomalies.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <EmptyState
              title="暂无异常数据"
              icon={AlertTriangle}
              description="打卡记录会按部门工作时段自动对班后判定。若还没有任何判定，请到「部门时段」配置各部门上下班时间，再点「一键分析异常」。"
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
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-muted-foreground">
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
                          {anomaly.type === 'LATE_5' && '迟到超过 5 分钟'}
                          {anomaly.type === 'LATE_15' && '迟到超过 15 分钟'}
                          {anomaly.type === 'MISSING_IN' && '缺上班卡'}
                          {anomaly.type === 'MISSING_OUT' && '缺下班卡'}
                          {anomaly.type === 'EARLY_LEAVE' && '早退'}
                        </span>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-muted-foreground">
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

  return null;
}
