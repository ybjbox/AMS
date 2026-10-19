import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ClipboardCheck, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { FailedState } from '@/components/ui/FailedState';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  attendanceApi,
  fetchAttendanceProofSheet,
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

/** 触发浏览器下载并回收 objectURL（revoke 漏掉的话标签页关不掉，内存一直涨） */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 月度考勤汇总报表（HR 月报）：按人聚合出勤/打卡/迟到/早退/缺卡 */
export default function MonthlyReport() {
  const [month, setMonth] = useState('');
  const [rows, setRows] = useState<MonthlySummaryRow[]>([]);
  const [stats, setStats] = useState<PunchMonthStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * 月报走自己的端点，失败原因不能借考勤页那个全局 `error`：那一屏是「这个月没有打卡」
   * 还是「服务没答话」得说准（审查 M1）。
   */
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(null);
    } catch (err) {
      // 失败时清空当前表格：留着上一个月的行顶在新月份下面，等于屏幕上是一份标错月份的数据
      setRows([]);
      setLoadError((err as { error?: string })?.error || '月报加载失败');
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

  /**
   * 判定人工校对表：把这一月的逐人逐日判定连同判定依据导成 Excel。
   *
   * 和上面那个 CSV 不是一回事 —— CSV 每人一行、给人看总数；这个表每人每天一行，
   * 写清当天对上了哪个班次、为什么这么判，并把需要人来看一眼的行标出来。
   * 判定在服务端算（同一份 shiftMatch），前端只负责把文件存下来，不重算。
   */
  const downloadProofSheet = useCallback(async (m: string) => {
    const t = toast.loading(`正在生成 ${m} 的判定明细…`);
    try {
      const blob = await fetchAttendanceProofSheet(m);
      downloadBlob(blob, `考勤判定-人工校对-${m.replace('-', '')}.xlsx`);
      toast.success(`已导出 ${m} 的判定明细`, { id: t });
    } catch (err) {
      toast.error((err as { error?: string })?.error || '导出失败', { id: t });
    }
  }, []);

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
            {/* 两种导出收进一个下拉：一个是给领导看的总数，一个是给 HR 逐行核对的明细，
                放两个并排按钮会让人以为它们是同一份数据的两种格式 */}
            <DropdownMenu>
              <DropdownMenuTrigger className="btn-secondary">
                <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">导出</span>
                <ChevronDown className="h-4 w-4 ml-1 hidden sm:block" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => downloadProofSheet(month)}>
                  <ClipboardCheck className="h-4 w-4 mr-2" aria-hidden="true" />
                  判定明细（人工校对）
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCsv(month, rows)}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden="true" />
                  月度汇总（CSV）
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        {rows.length === 0 && !isLoading && loadError ? (
          <FailedState subject="月度汇总" reason={loadError} onRetry={() => void load(month)} />
        ) : rows.length === 0 ? (
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
                  {/* 人数在表头上方的汇总里已经说过一次，这里只标"这一行是合计" */}
                合计
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
