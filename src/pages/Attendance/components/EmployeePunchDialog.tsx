import React, { useMemo } from 'react';
import { CalendarDays, Clock, AlertTriangle } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PunchRecord, Anomaly } from '@/store/useAttendanceStore';
import {
  anomalyDatesFor,
  groupPunchesByDate,
  recordsOfEmployee,
  summarizePunches,
  weekdayOf,
  isWeekend,
} from '../lib/punchTimeline';

export interface EmployeePunchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 被点开的人；null 表示未选中 */
  employee: { employeeId: string; employeeName: string } | null;
  /** 全量打卡（弹窗自己按工号筛，父组件不必预先过滤） */
  records: PunchRecord[];
  /** 全量异常，用来在某天标出"这天判过异常" */
  anomalies: Anomaly[];
  /**
   * 外层筛选是否正在生效。弹窗展示的是这个人的**全部**记录，
   * 而不是当前筛选范围内的那几条 —— 所以必须写明，否则"表格只剩 12 行、
   * 弹窗却有 114 条"看着像 bug。
   */
  outerFilterActive: boolean;
  outerFilterSummary: string;
}

/**
 * 点姓名看某个人的全部打卡记录。
 *
 * 按天分组而不是平铺：人均 57 条、最多 114 条，平铺根本看不出"每天打了几次"。
 * 日期倒序、同日内正序；一天只打 1 次和一天打 4 次以上会被标出来，因为这两种
 * 恰恰是异常判定里最容易出问题的情况。
 */
export default function EmployeePunchDialog({
  isOpen,
  onClose,
  employee,
  records,
  anomalies,
  outerFilterActive,
  outerFilterSummary,
}: EmployeePunchDialogProps) {
  const groups = useMemo(
    () => (employee ? groupPunchesByDate(recordsOfEmployee(records, employee.employeeId)) : []),
    [records, employee]
  );
  const summary = useMemo(() => summarizePunches(groups), [groups]);
  const anomalyDates = useMemo(
    () => (employee ? anomalyDatesFor(anomalies, employee.employeeId) : new Set<string>()),
    [anomalies, employee]
  );

  if (!employee) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      title={
        <span className="flex items-baseline gap-2">
          <span>{employee.employeeName}</span>
          <span className="text-sm font-normal text-muted-foreground tabular-nums">{employee.employeeId}</span>
        </span>
      }
      bodyClassName="p-0"
    >
      {/* 概况：条数 / 天数 / 区间，以及两种值得留意的日子 */}
      <div className="grid grid-cols-2 divide-x divide-zinc-100 border-b border-zinc-100 dark:divide-zinc-700/60 dark:border-zinc-700/60 sm:grid-cols-4">
        {[
          { label: '打卡条数', value: summary.total, icon: Clock },
          { label: '出勤天数', value: summary.days, icon: CalendarDays },
          { label: '仅 1 次的天', value: summary.singlePunchDays, icon: AlertTriangle, tone: summary.singlePunchDays > 0 ? 'amber' : 'plain' },
          { label: '4 次以上的天', value: summary.busyDays, icon: AlertTriangle, tone: summary.busyDays > 0 ? 'amber' : 'plain' },
        ].map((s) => (
          <div key={s.label} className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {s.label}
            </div>
            <div
              className={`mt-0.5 text-lg font-bold tabular-nums ${
                s.tone === 'amber'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-zinc-900 dark:text-white'
              }`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {(summary.firstDate || outerFilterActive) && (
        <p className="border-b border-zinc-100 px-4 py-2 text-2xs text-muted-foreground dark:border-zinc-700/60 tabular-nums">
          {summary.firstDate && <>区间 {summary.firstDate} ~ {summary.lastDate} · </>}
          {outerFilterActive && <>列表当前按「{outerFilterSummary}」筛选，这里显示的是该员工的全部记录</>}
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="这个人还没有打卡记录"
          icon={CalendarDays}
          description="他的打卡可能还没导入，或当前筛选条件把他排除了。"
        />
      ) : (
        <div className="max-h-[52vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{employee.employeeName}的每日打卡记录</caption>
            <tbody>
              {groups.map((g) => {
                const flagged = anomalyDates.has(g.date);
                return (
                  <tr
                    key={g.date}
                    className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-700/60"
                  >
                    {/* 日期列：定宽 + sticky，横向滚表格时不会跟着滑走 */}
                    <th
                      scope="row"
                      className="sticky left-0 w-[9.5rem] whitespace-nowrap border-r border-zinc-100 bg-white px-4 py-2.5 align-top font-normal dark:border-zinc-700/60 dark:bg-zinc-800"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
                          {g.date}
                        </span>
                        <span
                          className={`text-2xs ${isWeekend(g.date) ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
                        >
                          周{weekdayOf(g.date)}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="neutral">{g.punches.length} 次</Badge>
                        {flagged && <Badge variant="warning">有异常</Badge>}
                      </span>
                    </th>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {g.punches.map((r) => (
                          <span key={r.id} className="inline-flex items-center gap-1.5">
                            <span className="text-sm text-zinc-900 tabular-nums dark:text-zinc-100">{r.time}</span>
                            <Badge variant={r.source === 'wecom' ? 'primary' : 'neutral'}>
                              {r.source === 'wecom' ? '企业微信' : '补卡/导入'}
                            </Badge>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </BaseModal>
  );
}