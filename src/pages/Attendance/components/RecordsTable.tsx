import React, { useCallback, useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileSpreadsheet, SearchX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import EmployeePunchDialog from './EmployeePunchDialog';
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';
// store 的写动作不抛异常（失败原因作为返回值），4xx/5xx 也没有全局提示 ——
// 不接住它就会点了删除却毫无反应。统一出口见 saveFailure 的 reportWrite。
import { reportWrite } from '@/store/saveFailure';

export interface RecordsTableProps {
  records: PunchRecord[];
  /** 全量打卡：弹窗要按工号自取本人全部记录，不能只给当前页这 20 条 */
  allRecords: PunchRecord[];
  /** 全量异常：弹窗用它标出"这天判过异常" */
  anomalies: Anomaly[];
  totalCount: number;
  filterActive: boolean;
  filterSummary: string;
  onResetFilter: () => void;
  onImportClick: () => void;
  isLoading: boolean;
  canManage: boolean;
  canPurge: boolean;
  removeRecord: (id: string) => Promise<string | null>;
  clearRecords: () => Promise<string | null>;
  page: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
}

export default function RecordsTable({
  records,
  allRecords,
  anomalies,
  totalCount,
  filterActive,
  filterSummary,
  onResetFilter,
  onImportClick,
  isLoading,
  canManage,
  canPurge,
  removeRecord,
  clearRecords,
  page,
  onPageChange,
  itemsPerPage,
}: RecordsTableProps) {
  const confirm = useConfirm();
  // 点姓名 → 看这个人全部打卡。存的是 {工号, 姓名}：用工号而不是姓名做 key，
  // 因为重名（以及改名后新旧两条打卡并存）都会让姓名不再是唯一标识。
  const [detail, setDetail] = useState<{ employeeId: string; employeeName: string } | null>(null);

  const onClearRecords = useCallback(async () => {
    const ok = await confirm({
      title: `确定要清空全部 ${totalCount} 条打卡记录吗？`,
      description: '月报与异常分析将随之失效，需重新导入打卡数据，此操作不可恢复。',
      variant: 'danger',
    });
    if (ok) reportWrite(await clearRecords(), '已清空全部打卡记录');
  }, [confirm, clearRecords, totalCount]);

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

  const columns = canManage ? 6 : 5;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            {filterActive ? '筛选结果' : '已导入记录'}
          </h2>
          <span className="text-2xs text-muted-foreground tabular-nums">
            {filterActive ? `${records.length} / ${totalCount} 条` : `${totalCount} 条`}
          </span>
        </div>
        {canPurge && totalCount > 0 && (
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

      {isLoading ? (
        <TableSkeleton columns={columns} rows={5} />
      ) : records.length === 0 ? (
        <EmptyState
          title={filterActive ? '没有符合条件的打卡记录' : '还没有打卡记录'}
          icon={filterActive ? SearchX : FileSpreadsheet}
          description={
            filterActive
              ? '试着放宽日期区间，或清除姓名与来源条件。'
              : '从企业微信导出打卡表（横排表：一行一人、一列一天），或用标准模板导入。上传后先预览校验再确认。'
          }
          action={
            filterActive ? (
              <Button variant="secondary" onClick={onResetFilter}>
                清除筛选条件
              </Button>
            ) : canManage ? (
              <Button onClick={onImportClick}>导入打卡记录</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                {['工号', '日期', '时间', '来源'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  姓名
                </th>
                {canManage && (
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {records
                .slice((page - 1) * itemsPerPage, page * itemsPerPage)
                .map((record) => (
                  <tr key={record.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {record.employeeId}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {record.date}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {record.time}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm">
                      {record.source === 'wecom' ? (
                        <Badge variant="primary">企业微信</Badge>
                      ) : (
                        <Badge variant="neutral">补卡/导入</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {/* 姓名做成按钮而不是 span：读屏要能念出这是个可点的东西，
                          键盘要能 Tab 到。全局 base 规则会给它焦点环，不用手写。 */}
                      <button
                        type="button"
                        onClick={() => setDetail({ employeeId: record.employeeId, employeeName: record.employeeName })}
                        aria-label={`查看 ${record.employeeName}（${record.employeeId}）的全部打卡记录`}
                        title="查看该员工的全部打卡记录"
                        className="rounded text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:underline dark:text-brand-300"
                      >
                        {record.employeeName}
                      </button>
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 whitespace-nowrap text-right">
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
                ))}
            </tbody>
          </table>
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(records.length / itemsPerPage)}
            totalItems={records.length}
            itemsPerPage={itemsPerPage}
            onPageChange={onPageChange}
          />
        </div>
      )}

      <EmployeePunchDialog
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        employee={detail}
        records={allRecords}
        anomalies={anomalies}
        outerFilterActive={filterActive}
        outerFilterSummary={filterSummary}
      />
    </div>
  );
}