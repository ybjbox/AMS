import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  attendanceApi,
  type MonthlySummaryRow,
  type PunchMonthStat,
} from '@/services/attendanceApi';

/** CSV 导出（Excel 可直接打开；BOM 头保证中文不乱码） */
function exportCsv(month: string, rows: MonthlySummaryRow[]): void {
  const header = ['工号', '姓名', '部门', '出勤天数', '打卡次数', '迟到次数', '早退次数', '缺卡次数'];
  const lines = rows.map((r) =>
    [r.employeeId, r.employeeName, r.department || '-', r.workDays, r.punchCount, r.lateCount, r.earlyLeaveCount, r.missingCount]
      .map((v) => {
        const s = String(v);
        // 含逗号/引号的字段加引号转义
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(',')
  );
  const csv = '\ufeff' + [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `考勤月报_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`已导出 ${rows.length} 条月度汇总`);
}

/** 月度考勤汇总报表（HR 月报）：按人聚合出勤/打卡/迟到/早退/缺卡 */
export default function MonthlyReport() {
  const [month, setMonth] = useState('');
  const [rows, setRows] = useState<MonthlySummaryRow[]>([]);
  const [stats, setStats] = useState<PunchMonthStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * 用户是否手动选过月份：没选过才跟随服务端推荐（最近有数据的月份）。
   * 用 ref 而不是 state —— 初始请求还在飞时用户就点了月份，
   * state 版本会在初始响应回来时用过期的 touched=false 把用户选的月份盖掉。
   */
  const touchedRef = useRef(false);

  const load = useCallback(async (m: string) => {
    setIsLoading(true);
    try {
      // 空串 = 让服务端定：最近有数据的月份（新库回退当月）
      const res = m
        ? await attendanceApi.fetchMonthlySummary(m)
        : await attendanceApi.fetchLatestMonthlySummary();
      setRows(res.rows ?? []);
      if (Array.isArray(res.stats)) setStats(res.stats);
      if (!touchedRef.current) setMonth(res.month);
    } catch (err) {
      toast.error((err as { error?: string })?.error || '月报加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  // 汇总行（全表合计）
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          workDays: acc.workDays + r.workDays,
          punchCount: acc.punchCount + r.punchCount,
          lateCount: acc.lateCount + r.lateCount,
          earlyLeaveCount: acc.earlyLeaveCount + r.earlyLeaveCount,
          missingCount: acc.missingCount + r.missingCount,
        }),
        { workDays: 0, punchCount: 0, lateCount: 0, earlyLeaveCount: 0, missingCount: 0 }
      ),
    [rows]
  );

  // 异常人数（有任一异常的员工数，供顶部提示）
  const abnormalCount = useMemo(
    () => rows.filter((r) => r.lateCount || r.earlyLeaveCount || r.missingCount).length,
    [rows]
  );

  // 哪些月份有打卡、各有几天（服务端只回有数据的月份）：月份选择器旁边的快捷入口
  const currentStat = stats.find((s) => s.month === month) ?? null;
  /** 别的月份打卡日明显更多（当前月是半截报表时提醒一句） */
  const fullerMonth = useMemo(
    () => stats.find((s) => s.month !== month && s.days > (currentStat?.days ?? 0)) ?? null,
    [stats, month, currentStat]
  );

  const switchMonth = useCallback(
    (m: string) => {
      touchedRef.current = true;
      setMonth(m);
      void load(m);
    },
    [load]
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 工具栏 */}
      <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700 flex flex-wrap items-center gap-3 shrink-0">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <CalendarDays className="w-4 h-4 text-zinc-400" aria-hidden="true" />
          月份
          <Input
            type="month"
            value={month}
            onChange={(e) => switchMonth(e.target.value)}
            className="w-auto"
          />
        </label>
        <button
          onClick={() => void load(month)}
          disabled={isLoading}
          className="btn-secondary"
          aria-label="刷新月报"
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">刷新</span>
        </button>
        <div className="flex-1" />
        {rows.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">
              {rows.length} 名员工 · {abnormalCount} 人有考勤异常
            </span>
            <button onClick={() => exportCsv(month, rows)} className="btn-secondary">
              <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">导出 CSV</span>
            </button>
          </>
        )}
      </div>

      {/* 月份快捷切换：默认落在「最近有打卡的月份」，但那个月可能只有几天，
          所以把「哪几个月有数据、各几天」直接摆出来，不用靠猜 */}
      {stats.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-200/80 dark:border-zinc-700 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">有打卡的月份</span>
          {stats.map((s) => (
            <button
              key={s.month}
              type="button"
              aria-pressed={s.month === month}
              onClick={() => switchMonth(s.month)}
              className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                s.month === month
                  ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200'
                  : 'border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {s.month} · {s.days} 天
            </button>
          ))}
          {fullerMonth && currentStat && (
            <span className="text-xs text-muted-foreground">
              {month} 只有 {currentStat.days} 个打卡日，{fullerMonth.month} 有 {fullerMonth.days} 天
            </span>
          )}
        </div>
      )}

      {/* 报表 */}
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground py-12">
            <CalendarDays className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" aria-hidden="true" />
            {isLoading
              ? '加载中…'
              : stats.length > 0
                ? `${month} 没有打卡记录，可点上方有数据的月份查看`
                : `${month} 暂无打卡数据`}
          </div>
        ) : (
          <table className="w-full text-left text-sm" aria-label="月度考勤汇总">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">工号</th>
                <th className="px-4 py-2.5 font-medium">姓名</th>
                <th className="px-4 py-2.5 font-medium">部门</th>
                <th className="px-4 py-2.5 font-medium text-right">出勤天数</th>
                <th className="px-4 py-2.5 font-medium text-right">打卡次数</th>
                <th className="px-4 py-2.5 font-medium text-right">迟到</th>
                <th className="px-4 py-2.5 font-medium text-right">早退</th>
                <th className="px-4 py-2.5 font-medium text-right">缺卡</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                return (
                  <tr key={r.employeeId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs tabular-nums">{r.employeeId}</td>
                    <td className="px-4 py-2.5 text-zinc-900 dark:text-white font-medium">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{r.department || '-'}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-900 dark:text-white tabular-nums font-medium">{r.workDays}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300 tabular-nums">{r.punchCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.lateCount > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">{r.lateCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.earlyLeaveCount > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">{r.earlyLeaveCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.missingCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{r.missingCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/60 text-xs">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-zinc-700 dark:text-zinc-200" colSpan={3}>
                  合计（{rows.length} 人）
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{totals.workDays}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{totals.punchCount}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{totals.lateCount}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{totals.earlyLeaveCount}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{totals.missingCount}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
