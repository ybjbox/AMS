import { Pressable } from '@/components/ui/Pressable';
import React, { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, SearchX, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { BadgeVariant } from '@/components/ui/Badge';
import { Table, TableFrame } from '@/components/ui/Table';
import CoverageBanner from './CoverageBanner';
import { useAttendanceStore } from '@/store/useAttendanceStore';
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
  /** 全库异常为 0 且最近一次读取失败时说「加载失败」，不说「还没有进行过异常分析」（审查 M1） */
  loadError?: string | null;
  onRetry?: () => void;
}

const TONE_TO_VARIANT: Record<AnomalyTone, BadgeVariant> = {
  warning: 'warning',
  destructive: 'destructive',
  neutral: 'neutral',
};

type SortKey = 'date' | 'name';

export default function AnomaliesTable({
  anomalies,
  totalCount,
  filterActive,
  onResetFilter,
  onAnalyze,
  canAnalyze,
  hasAnalysis,
  isLoading,
  loadError,
  onRetry,
}: AnomaliesTableProps) {
  /**
   * 「判定依据」取自服务端同一份判定装配（与月报、校对表一致）。
   * 光有「迟到超过 15 分钟」这句结论，核的人还是得去导校对表才知道是凭哪张卡判的。
   */
  const verdictsByMonth = useAttendanceStore((s) => s.verdictsByMonth);
  const loadVerdicts = useAttendanceStore((s) => s.loadVerdicts);
  const months = useMemo(() => [...new Set(anomalies.map((a) => a.date.slice(0, 7)))].sort(), [anomalies]);
  /** 判定依据取数失败的月份：必须与"确实没有要确认的"区分开（audit-1） */
  const [verdictFailed, setVerdictFailed] = useState<Set<string>>(new Set());
  useEffect(() => {
    for (const m of months) {
      void loadVerdicts(m).then((err) => {
        if (!err) return;
        setVerdictFailed((prev) => new Set(prev).add(m));
      });
    }
  }, [months, loadVerdicts]);

  const whyByKey = useMemo(() => {
    const map = new Map<string, { flag: string; why: string }>();
    for (const m of months) {
      for (const d of verdictsByMonth[m] ?? []) map.set(`${d.employeeId}|${d.date}`, { flag: d.flag, why: d.why });
    }
    return map;
  }, [months, verdictsByMonth]);

  /**
   * 默认按日期**倒序**：这个页面是"去看最近谁有问题"，而异常往往攒了几百条 ——
   * 正序时本月那几条永远沉在最底下，要滚到列表末端才看见。
   */
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  /**
   * 展开完整判定依据的行。原先整句只挂在 title 悬停上——触屏取不到、键盘也到不了，
   * 而"凭哪张卡"恰恰是员工最需要看的一句话（audit-2）。
   */
  const [expandedWhy, setExpandedWhy] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...anomalies].sort((a, b) => {
      const cmp =
        sort.key === 'name'
          ? a.employeeName.localeCompare(b.employeeName, 'zh-Hans-CN') || a.date.localeCompare(b.date)
          : a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName, 'zh-Hans-CN');
      return cmp * sign || a.employeeId.localeCompare(b.employeeId);
    });
  }, [anomalies, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="p-6 flex flex-col h-full">
      <CoverageBanner />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : loadError && totalCount === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <FailedState subject="异常清单" reason={loadError} onRetry={onRetry} />
        </div>
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
                <Pressable type="button" className="btn-secondary" onClick={onResetFilter}>
                  清除筛选条件
                </Pressable>
              ) : canAnalyze ? (
                <Pressable type="button" className="btn-primary" onClick={onAnalyze}>
                  一键分析异常
                </Pressable>
              ) : undefined
            }
          />
        </div>
      ) : (
        <TableFrame className="border border-zinc-100 dark:border-zinc-800 rounded-2xl">
          <Table minWidth="min-w-225" nowrapHeaders className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Pressable
                    type="button"
                    onClick={() => toggleSort('date')}
                    className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    日期
                    <SortIcon active={sort.key === 'date'} dir={sort.dir} />
                  </Pressable>
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Pressable
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    姓名
                    <SortIcon active={sort.key === 'name'} dir={sort.dir} />
                  </Pressable>
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  工号
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  异常类型
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  描述
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  需确认
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 bg-white dark:divide-zinc-800/50 dark:bg-zinc-800">
              {rows.map((anomaly) => {
                const v = whyByKey.get(`${anomaly.employeeId}|${anomaly.date}`);
                return (
                  <tr key={anomaly.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {anomaly.date}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-200">
                      {anomaly.employeeName}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {anomaly.employeeId}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Badge variant={TONE_TO_VARIANT[anomalyTone(anomaly.type)]}>
                        {ANOMALY_TYPE_LABEL[anomaly.type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{anomaly.description}</td>
                    {/* 描述里已经写了"迟到几分钟、对的是哪个班"，这一格只补它没说的：
                        单卡 / 跨零点归前一日 / ★ 那几类要人看一眼的情况。完整依据挂在这格的
                        悬停提示里，与「打卡记录」弹窗和导出表同一串字。 */}
                    <td className="max-w-64 px-4 py-2 text-2xs">
                      {v ? (
                        <div>
                          <Pressable
                            type="button"
                            aria-expanded={expandedWhy.has(anomaly.id)}
                            onClick={() =>
                              setExpandedWhy((prev) => {
                                const next = new Set(prev);
                                if (next.has(anomaly.id)) next.delete(anomaly.id);
                                else next.add(anomaly.id);
                                return next;
                              })
                            }
                            className={`inline-flex items-center gap-1 text-left ${
                              v.flag.startsWith('★')
                                ? 'font-medium text-amber-800 dark:text-amber-300'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {v.flag || '看依据'}
                            <ChevronDown
                              className={`size-3 transition-transform ${expandedWhy.has(anomaly.id) ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </Pressable>
                          {expandedWhy.has(anomaly.id) && (
                            <p className="soft-rise-in mt-1 text-muted-foreground">{v.why}</p>
                          )}
                        </div>
                      ) : verdictFailed.has(anomaly.date.slice(0, 7)) ? (
                        <Pressable
                          type="button"
                          className="text-left text-amber-700 underline underline-offset-2 dark:text-amber-400"
                          onClick={() => {
                            const m = anomaly.date.slice(0, 7);
                            void loadVerdicts(m).then((err) => {
                              if (err) return;
                              setVerdictFailed((prev) => {
                                const next = new Set(prev);
                                next.delete(m);
                                return next;
                              });
                            });
                          }}
                        >
                          依据未取到 · 重试
                        </Pressable>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {filterActive && (
            <p className="px-4 py-2 text-2xs tabular-nums text-muted-foreground">
              筛选出 {anomalies.length} / {totalCount} 条异常
            </p>
          )}
        </TableFrame>
      )}
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
  return dir === 'asc' ? (
    <ChevronUp className="h-3 w-3" aria-hidden="true" />
  ) : (
    <ChevronDown className="h-3 w-3" aria-hidden="true" />
  );
}