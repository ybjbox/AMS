import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock, AlertTriangle, Trash2 } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/useConfirm';
import { reportWrite } from '@/store/saveFailure';
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
  /**
   * 列表当前**筛选后**的记录，弹窗与列表保持同一口径。
   * 筛选生效时点开某人，弹窗就是"这个人在当前筛选范围内的全部记录"，
   * 不会出现"表格 12 行、弹窗 114 条"这种看着像坏掉的落差。
   */
  records: PunchRecord[];
  /** 全量异常，用来在某天标出"这天判过异常"（不受筛选影响，异常是独立事实） */
  anomalies: Anomaly[];
  /** 外层筛选摘要，用于顶部写明"现在看的是哪一段" */
  outerFilterActive: boolean;
  outerFilterSummary: string;
  /** 逐条删除的权限（原本挂在逐条表格的行尾，现在收进弹窗） */
  canManage: boolean;
  removeRecord: (id: string) => Promise<string | null>;
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
  canManage,
  removeRecord,
}: EmployeePunchDialogProps) {
  // 弹窗内的二次筛选：外层区间可能横跨几个月，而一个人最多有 114 条记录，
  // 想精确定位某一周仍要再筛一层。初值取外层的区间，打开即与列表一致。
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const confirm = useConfirm();

  const onDelete = async (r: PunchRecord) => {
    const ok = await confirm({
      title: '确定要删除这条打卡记录吗？',
      description: '删除后需重新导入才能恢复。',
      variant: 'danger',
    });
    if (ok) reportWrite(await removeRecord(r.id), '已删除该条打卡记录');
  };

  // 每次打开（换人或重新打开）都用当前外层条件重置：不该残留上一个人的区间。
  // 在渲染期比较并就地修正，而不是塞进 useEffect —— effect 里 setState 会多跑一轮
  // 渲染，也会�� react-hooks/set-state-in-effect 拦下。
  const openKey = isOpen && employee ? employee.employeeId : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setFrom('');
    setTo('');
  }

  const scoped = useMemo(() => {
    if (!employee) return [];
    const mine = recordsOfEmployee(records, employee.employeeId);
    return groupPunchesByDate(
      from || to ? mine.filter((r) => (!from || r.date >= from) && (!to || r.date <= to)) : mine
    );
  }, [records, employee, from, to]);

  const summary = useMemo(() => summarizePunches(scoped), [scoped]);
  /** 这个人在当前外层筛选下的全部天数，给空状态算"放宽后能看到多少" */
  const totalDays = useMemo(
    () => (employee ? groupPunchesByDate(recordsOfEmployee(records, employee.employeeId)).length : 0),
    [records, employee]
  );
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

      {/* 弹窗内二次筛选：一个人的记录可能横跨几个月，想定位某一周仍要再筛一层 */}
      <div className="flex flex-wrap items-end gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-700/60">
        <div>
          <label htmlFor="emp-from" className="mb-1 block text-2xs text-muted-foreground">
            本人区间起
          </label>
          <Input
            id="emp-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[9rem] text-xs dark:[color-scheme:dark]"
          />
        </div>
        <span className="pb-1.5 text-xs text-muted-foreground" aria-hidden="true">
          —
        </span>
        <div>
          <label htmlFor="emp-to" className="mb-1 block text-2xs text-muted-foreground">
            止
          </label>
          <Input
            id="emp-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[9rem] text-xs dark:[color-scheme:dark]"
          />
        </div>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="pb-1.5 text-2xs text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300"
          >
            清除
          </button>
        )}
        <div className="flex-1" />
        <span className="pb-1.5 text-2xs text-muted-foreground tabular-nums">
          {outerFilterActive ? (
            <>
              外层筛选「{outerFilterSummary}」
              {summary.firstDate && <> · 本人当前 {summary.firstDate} ~ {summary.lastDate}</>}
            </>
          ) : (
            '全部时间'
          )}
        </span>
      </div>

      {scoped.length === 0 ? (
        <EmptyState
          title={from || to ? '这个区间内没有打卡' : outerFilterActive ? '当前筛选下没有这个人的打卡' : '这个人还没有打卡记录'}
          icon={CalendarDays}
          description={
            from || to
              ? `把本人区间放宽到 ${employee.employeeName} 在当前筛选下的全部 ${totalDays} 天就能看到。`
              : outerFilterActive
                ? `他已经不在「${outerFilterSummary}」这个范围里了 —— 放宽日期区间或清除来源条件就能看到。`
                : '他的打卡可能还没导入。'
          }
        />
      ) : (
        <div className="max-h-[52vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{employee.employeeName}的每日打卡记录</caption>
            <tbody>
              {scoped.map((g) => {
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
                          <span
                            key={r.id}
                            className="group/p inline-flex items-center gap-1.5"
                          >
                            <span className="text-sm text-zinc-900 tabular-nums dark:text-zinc-100">{r.time}</span>
                            <Badge variant={r.source === 'wecom' ? 'primary' : 'neutral'}>
                              {r.source === 'wecom' ? '企业微信' : '补卡/导入'}
                            </Badge>
                            {/* 逐条删除从主表收进这里：主表现在是员工维度，
                                "删掉某人的某一次打卡"只有一个自然的落点 */}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => void onDelete(r)}
                                aria-label={`删除打卡记录：${r.employeeName} ${r.date} ${r.time}`}
                                title="删除该条打卡记录"
                                className="rounded text-zinc-400 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/p:opacity-100 dark:text-zinc-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
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
