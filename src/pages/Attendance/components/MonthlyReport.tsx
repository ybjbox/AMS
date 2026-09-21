import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  attendanceApi,
  type MonthlySummaryRow,
} from '@/services/attendanceApi';

/** 月份选择器的默认值：当月 */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<MonthlySummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (m: string) => {
    setIsLoading(true);
    try {
      const res = await attendanceApi.fetchMonthlySummary(m);
      setRows(res.rows ?? []);
    } catch (err) {
      toast.error((err as { error?: string })?.error || '月报加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

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

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 工具栏 */}
      <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700 flex flex-wrap items-center gap-3 shrink-0">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <CalendarDays className="w-4 h-4 text-zinc-400" aria-hidden="true" />
          月份
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
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
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {rows.length} 名员工 · {abnormalCount} 人有考勤异常
            </span>
            <button onClick={() => exportCsv(month, rows)} className="btn-secondary">
              <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">导出 CSV</span>
            </button>
          </>
        )}
      </div>

      {/* 报表 */}
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-zinc-500 dark:text-zinc-400 py-12">
            <CalendarDays className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" aria-hidden="true" />
            {isLoading ? '加载中…' : `${month} 暂无打卡数据`}
          </div>
        ) : (
          <table className="w-full text-left text-sm" aria-label="月度考勤汇总">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
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
                    <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 font-mono text-xs tabular-nums">{r.employeeId}</td>
                    <td className="px-4 py-2.5 text-zinc-900 dark:text-white font-medium">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{r.department || '-'}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-900 dark:text-white tabular-nums font-medium">{r.workDays}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300 tabular-nums">{r.punchCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.lateCount > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">{r.lateCount}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.earlyLeaveCount > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">{r.earlyLeaveCount}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.missingCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{r.missingCount}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">0</span>
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
