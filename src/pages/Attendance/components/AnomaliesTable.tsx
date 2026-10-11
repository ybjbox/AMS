import React from 'react';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle, SearchX, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { BadgeVariant } from '@/components/ui/Badge';
import CoverageBanner from './CoverageBanner';
import type { Anomaly } from '@/store/useAttendanceStore';
import { ANOMALY_TYPE_LABEL, anomalyTone } from '../lib/filters';
import type { AnomalyTone } from '../lib/filters';

export interface AnomaliesTableProps {
  anomalies: Anomaly[];
  totalCount: number;
  filterActive: boolean;
  onResetFilter: () => void;
  onAnalyze: () => void;
  canAnalyze: boolean;
  /** 上一次分析的覆盖统计（null = 从没分析过） */
  hasAnalysis: boolean;
  isLoading: boolean;
}

const TONE_TO_VARIANT: Record<AnomalyTone, BadgeVariant> = {
  warning: 'warning',
  destructive: 'destructive',
  neutral: 'neutral',
};

export default function AnomaliesTable({
  anomalies,
  totalCount,
  filterActive,
  onResetFilter,
  onAnalyze,
  canAnalyze,
  hasAnalysis,
  isLoading,
}: AnomaliesTableProps) {
  return (
    <div className="p-6 flex flex-col h-full">
      <CoverageBanner />

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : anomalies.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <EmptyState
            title={
              filterActive
                ? '没有符合条件的异常'
                : totalCount === 0 && hasAnalysis
                  ? '本次分析没有发现异常'
                  : '还没有进行过异常分析'
            }
            icon={filterActive ? SearchX : totalCount === 0 && hasAnalysis ? ShieldCheck : AlertTriangle}
            description={
              filterActive
                ? '试着换一个异常类型，或清空姓名搜索。'
                : totalCount === 0 && hasAnalysis
                  ? '所有打卡都已按部门工作时段对上班次。这份结论只覆盖已导入的打卡日，新增打卡后需要重新分析。'
                  : '打卡记录会按部门工作时段自动对班后判定。请先确认部门时段已配置、且打卡记录已导入，再点「一键分析异常」。'
            }
            action={
              filterActive ? (
                <button type="button" className="btn-secondary" onClick={onResetFilter}>
                  清除筛选条件
                </button>
              ) : canAnalyze ? (
                <button type="button" className="btn-primary" onClick={onAnalyze}>
                  一键分析异常
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800 rounded-2xl">
          <table className="min-w-[720px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                {['日期', '姓名', '工号', '异常类型', '描述'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {anomalies.map((anomaly) => (
                <tr key={anomaly.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                    {anomaly.date}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-200">
                    {anomaly.employeeName}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                    {anomaly.employeeId}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Badge variant={TONE_TO_VARIANT[anomalyTone(anomaly.type)]}>
                      {ANOMALY_TYPE_LABEL[anomaly.type]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{anomaly.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filterActive && (
            <p className="px-4 py-2 text-2xs text-muted-foreground tabular-nums">
              筛选出 {anomalies.length} / {totalCount} 条异常
            </p>
          )}
        </div>
      )}
    </div>
  );
}