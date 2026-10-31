import { Pressable } from '@/components/ui/Pressable';
import React, { useMemo, useState } from 'react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, FileSpreadsheet, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/Badge';
import { Table, TableFrame, TableHead, TableHeader, StickyCell } from '@/components/ui/Table';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/useConfirm';
import EmployeePunchDialog from './EmployeePunchDialog';
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';
import type { EmployeeRollupRow, RollupSortKey } from '../lib/employeeRollup';
import { daysSinceLast, filterByAnomaly, rollupByEmployee, rollupTotals, sortRollup } from '../lib/employeeRollup';
import { reportWrite } from '@/store/saveFailure';

export interface EmployeeRollupTableProps {
  /** 筛选后的打卡；汇总口径全部由它推导 */
  records: PunchRecord[];
  /**
   * 全库打卡条数（不受筛选影响）。破坏性操作的确认框必须报这个数，
   * 而不是 `records.length` —— 筛到本月时报「63 条」却删掉 1897 条，
   * 等于让唯一的防线给出错误的数字。
   */
  totalCount: number;
  /** 异常也按同一区间收窄，否则"异常数"会和打卡条数对不上 */
  anomalies: Anomaly[];
  filterActive: boolean;
  filterSummary: string;
  onResetFilter: () => void;
  onImportClick: () => void;
  isLoading: boolean;
  /** 全库打卡为 0 且最近一次读取失败时，界面要说「加载失败」而不是「还没有打卡记录」（审查 M1） */
  loadError?: string | null;
  onRetry?: () => void;
  canManage: boolean;
  canPurge: boolean;
  clearRecords: () => Promise<string | null>;
  removeRecord: (id: string) => Promise<string | null>;
}

const COLUMNS: { key: RollupSortKey | null; label: string; align?: 'right' }[] = [
  { key: 'name', label: '姓名' },
  { key: null, label: '工号' },
  { key: 'records', label: '打卡条数', align: 'right' },
  { key: 'days', label: '出勤天数', align: 'right' },
  { key: 'anomalies', label: '异常', align: 'right' },
  { key: 'lastDate', label: '最近打卡' },
];

/**
 * 每人一行，点开看这个人的全部打卡。
 *
 * 原来是逐条打卡分页 —— 1897 条是 89 页，翻到第二遍就放弃了。而这个页面真正要回答的
 * 是"这个人出勤怎么样"，不是"第 1024 条卡是谁的"。逐条收进弹窗，主表只留 26 行，
 * 一屏扫完。
 */
export default function EmployeeRollupTable({
  records,
  totalCount,
  anomalies,
  filterActive,
  filterSummary,
  onResetFilter,
  onImportClick,
  isLoading,
  loadError,
  onRetry,
  canManage,
  canPurge,
  clearRecords,
  removeRecord,
}: EmployeeRollupTableProps) {
  const [sortKey, setSortKey] = useState<RollupSortKey>('anomalies');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [onlyWithAnomaly, setOnlyWithAnomaly] = useState(false);
  const [detail, setDetail] = useState<{ employeeId: string; employeeName: string } | null>(null);
  const confirm = useConfirm();

  const rows = useMemo(
    () => sortRollup(filterByAnomaly(rollupByEmployee(records, anomalies), onlyWithAnomaly), sortKey, sortDir),
    [records, anomalies, onlyWithAnomaly, sortKey, sortDir]
  );
  const totals = useMemo(() => rollupTotals(rows), [rows]);
  const today = new Date();

  const toggleSort = (key: RollupSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      // 姓名从大到小读起来别扭，切过去时默认正序；其余数值列倒序更有用（问题多的排前面）
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const onClearAll = async () => {
    // 破坏性操作：确认框报的是**全库**条数（服务端 `DELETE FROM punch_records` 无 WHERE），
    // 并把筛选后的数字一并写出来 —— 否则筛到本月时"63 条"会替 1897 条背书。
    const ok = await confirm({
      title: `确定要清空全部 ${totalCount} 条打卡记录吗？`,
      description:
        filterActive && records.length !== totalCount
          ? `当前筛选下是 ${records.length} 条，但清空不受筛选影响，会删掉全部 ${totalCount} 条。月报与异常分析将随之失效，需重新导入打卡数据，此操作不可恢复。`
          : '月报与异常分析将随之失效，需重新导入打卡数据，此操作不可恢复。',
      variant: 'danger',
    });
    if (!ok) return;
    reportWrite(await clearRecords(), '已清空全部打卡记录');
    setDetail(null);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <ListSkeleton rows={8} />
      </div>
    );
  }

  // 判断用「全库条数为 0」而不是「这一屏没行」：写操作失败也会置 error，
  // 那时表里明明还有人，不该整张表退成失败态。
  if (loadError && totalCount === 0) {
    return (
      <div className="p-6">
        <FailedState subject="打卡记录" reason={loadError} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            {onlyWithAnomaly ? '有异常的员工' : '员工出勤'}
          </h2>
          <span className="text-2xs text-muted-foreground tabular-nums">
            {rows.length} 人 · {totals.records} 条打卡 · {totals.days} 人日
            {filterActive && `（共 ${records.length} 条 / 筛选后）`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyWithAnomaly}
              onChange={(e) => setOnlyWithAnomaly(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            只看有异常
          </label>
          {canPurge && totalCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="h-auto px-0 text-sm text-destructive hover:text-destructive/80"
              onClick={() => void onClearAll()}
            >
              清空全部记录
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={onlyWithAnomaly ? '当前范围内没有异常' : filterActive ? '没有符合条件的打卡' : '还没有打卡记录'}
          icon={onlyWithAnomaly ? AlertTriangle : filterActive ? SearchX : FileSpreadsheet}
          description={
            onlyWithAnomaly
              ? '这个区间里每个人的打卡都按时对上了。要看全部员工，取消上面的「只看有异常」。'
              : filterActive
                ? `当前筛选「${filterSummary}」下没有打卡记录。放宽日期区间或清除来源条件再试。`
                : '从企业微信导出打卡表（横排表：一行一人、一列一天），或用标准模板导入。上传后先预览校验再确认。'
          }
          action={
            filterActive && !onlyWithAnomaly ? (
              <Button variant="secondary" onClick={onResetFilter}>
                清除筛选条件
              </Button>
            ) : !filterActive && canManage ? (
              <Button onClick={onImportClick}>导入打卡记录</Button>
            ) : undefined
          }
        />
      ) : (
        <TableFrame>
          <Table minWidth="min-w-180" nowrapHeaders className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <TableHeader sticky={false}>
              <tr>
                {COLUMNS.map((c, i) => {
                  const sortable = c.key !== null;
                  const isActive = sortable && sortKey === c.key;
                  const content =
                    sortable && c.key ? (
                      <Pressable
                        type="button"
                        onClick={() => toggleSort(c.key!)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded transition-colors duration-quick hover:text-zinc-900 dark:hover:text-zinc-100',
                          isActive && 'text-zinc-900 dark:text-white'
                        )}
                      >
                        {c.align === 'right' && isActive && <SortIcon dir={sortDir} />}
                        {c.label}
                        {!isActive && <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />}
                        {c.align !== 'right' && isActive && <SortIcon dir={sortDir} />}
                      </Pressable>
                    ) : (
                      c.label
                    );
                  const headProps = {
                    scope: 'col' as const,
                    'aria-sort': (isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') as
                      | 'ascending'
                      | 'descending'
                      | 'none',
                    density: 'compact' as const,
                    align: c.align ?? ('left' as const),
                    sticky: i === 0 ? ('left' as const) : undefined,
                  };
                  return (
                    <TableHead key={c.label} {...headProps}>
                      {content}
                    </TableHead>
                  );
                })}
              </tr>
            </TableHeader>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {rows.map((r) => (
                <Row
                  key={r.employeeId}
                  row={r}
                  today={today}
                  onOpen={() => setDetail({ employeeId: r.employeeId, employeeName: r.employeeName })}
                />
              ))}
            </tbody>
            <tfoot className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                <StickyCell side="left" className="bg-zinc-50/50 px-4 py-2 dark:bg-zinc-800/50">
                  合计 {totals.employees} 人
                </StickyCell>
                <td className="px-4 py-2 text-muted-foreground">—</td>
                <td className="px-4 py-2 text-right tabular-nums">{totals.records}</td>
                <td className="px-4 py-2 text-right tabular-nums">{totals.days}</td>
                <td className="px-4 py-2 text-right tabular-nums">{totals.anomalies}</td>
                <td className="px-4 py-2 text-muted-foreground">—</td>
              </tr>
            </tfoot>
          </Table>
        </TableFrame>
      )}

      <EmployeePunchDialog
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        employee={detail}
        records={records}
        anomalies={anomalies}
        outerFilterActive={filterActive}
        outerFilterSummary={filterSummary}
        canManage={canManage}
        removeRecord={removeRecord}
      />
    </div>
  );
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' }) {
  return dir === 'asc' ? (
    <ChevronUp className="h-3 w-3" aria-hidden="true" />
  ) : (
    <ChevronDown className="h-3 w-3" aria-hidden="true" />
  );
}

function Row({ row, today, onOpen }: { row: EmployeeRollupRow; today: Date; onOpen: () => void }) {
  const idle = daysSinceLast(row.lastDate, today);
  // 超过一周没打卡值得看一眼（公司规模下，超过一周基本等于离职或长期请假）
  const stale = idle !== null && idle > 7;
  return (
    <tr className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
      <StickyCell
        side="left"
        className="whitespace-nowrap bg-white px-4 py-2 transition-colors hover:bg-zinc-50/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/30"
      >
        <Pressable
          type="button"
          onClick={onOpen}
          aria-label={`查看 ${row.employeeName}（${row.employeeId}）的全部打卡记录`}
          title="查看该员工的全部打卡记录"
          className="rounded text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:underline dark:text-brand-300"
        >
          {row.employeeName}
        </Pressable>
      </StickyCell>
      <td className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground tabular-nums">{row.employeeId}</td>
      <td className="px-4 py-2 whitespace-nowrap text-right text-sm text-zinc-900 tabular-nums dark:text-zinc-100">
        {row.records}
        {row.wecomRecords > 0 && row.wecomRecords < row.records && (
          <span className="ml-1 text-2xs text-muted-foreground">（企微 {row.wecomRecords}）</span>
        )}
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-right text-sm text-zinc-900 tabular-nums dark:text-zinc-100">
        {row.days}
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-right">
        {row.anomalies > 0 ? (
          <Pressable
            type="button"
            onClick={onOpen}
            aria-label={`查看 ${row.employeeName} 的 ${row.anomalies} 条异常对应打卡`}
            className="inline-flex items-center gap-1 rounded-full"
          >
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {row.anomalies}
            </Badge>
          </Pressable>
        ) : (
          <span className="text-sm text-muted-foreground tabular-nums">0</span>
        )}
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-sm tabular-nums">
        <span className={stale ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>{row.lastDate}</span>
        {idle !== null && idle > 0 && <span className="ml-1.5 text-2xs text-muted-foreground">{idle} 天前</span>}
      </td>
    </tr>
  );
}

/** 距今太久没打卡时，最近打卡那一格标成琥珀色（>7 天的判断在 Row 里） */
