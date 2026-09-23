import { CircleDashed } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { useAttendanceStore } from '@/store/useAttendanceStore';

/**
 * 异常分析的覆盖率说明。
 *
 * "今天 0 条异常"有两种完全不同的成因：真的都准时，或压根没判定（部门没配时段、
 * 首卡与所有时段差太远、当天不是工作日）。不写出来的话，前者会被误当成后者已被处理。
 */
export default function CoverageBanner() {
  const coverage = useAttendanceStore((state) => state.analyzeCoverage);
  const at = useAttendanceStore((state) => state.analyzeCoverageAt);
  if (!coverage || coverage.days === 0) return null;

  const notJudged = coverage.unmatched + coverage.noPlan;
  return (
    <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 p-3 mb-3 space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <CircleDashed className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          {at ? `${new Date(at).toLocaleString('zh-CN', { hour12: false })} 的分析：` : '本次分析：'}
          {coverage.days} 个人日 · 按部门时段 <span className="tabular-nums">{coverage.byRule}</span> ·
          按逐日排班 <span className="tabular-nums">{coverage.bySchedule}</span> ·
          请假日跳过 <span className="tabular-nums">{coverage.leaveSkipped}</span>
        </span>
        <Badge variant={notJudged === 0 ? 'success' : 'warning'}>
          未判定 <span className="tabular-nums">{notJudged}</span>
        </Badge>
      </p>
      {notJudged > 0 && (
        <ul className="space-y-1 pl-1">
          {coverage.unmatchedSample.map((item) => (
            <li key={`${item.employeeId}-${item.date}`} className="text-xs text-muted-foreground">
              <span className="text-zinc-900 dark:text-zinc-100">
                {item.employeeName}（{item.employeeId}）
              </span>
              <span className="tabular-nums"> {item.date} · {item.reason}</span>
            </li>
          ))}
          {notJudged > coverage.unmatchedSample.length && (
            <li className="text-xs text-muted-foreground">…另有 {notJudged - coverage.unmatchedSample.length} 个人日未判定</li>
          )}
        </ul>
      )}
    </div>
  );
}
