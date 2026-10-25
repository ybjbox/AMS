import React, { useEffect, useState } from 'react';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { attendanceApi } from '@/services/attendanceApi';

interface Coverage {
  latestDate: string | null;
  month: string;
  coveredDays: number;
  elapsedDays: number;
  uncoveredDays: number;
}

/**
 * 「数据截止到哪天」的一行。
 *
 * 为什么单独一条：判定表只说自己判了什么，不说依据的数据到哪天。实测数据曾滞后 19 天，
 * 员工在月底打开看到空结论，分不清"确实没问题"和"这个月还没导进来"（audit-7）。
 * 取数失败时不装没事——直接说"截止日未确认"，因为沉默等于让人以为数据是全的。
 */
export default function DataCutoffBanner({ className = '' }: { className?: string }) {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await attendanceApi.fetchCoverage();
        if (!cancelled) setCoverage(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className={`flex items-center gap-1.5 text-2xs text-amber-700 dark:text-amber-400 ${className}`}>
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        数据截止日未能确认（服务未响应）——下面的结论可能是旧的
      </p>
    );
  }
  if (!coverage) return null;

  if (!coverage.latestDate) {
    return (
      <p className={`flex items-center gap-1.5 text-2xs text-muted-foreground ${className}`}>
        <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
        还没有任何打卡数据
      </p>
    );
  }

  const lagging = coverage.uncoveredDays > 0;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs ${
        lagging ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'
      } ${className}`}
      role="status"
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        数据截止 <b className="tabular-nums">{coverage.latestDate}</b>
      </span>
      <span className="text-muted-foreground">·</span>
      <span>
        本月覆盖 <b className="tabular-nums">{coverage.coveredDays}</b> 天 / 已过{' '}
        <b className="tabular-nums">{coverage.elapsedDays}</b> 天
      </span>
      {lagging && (
        <>
          <span className="text-muted-foreground">·</span>
          <span>
            未覆盖 <b className="tabular-nums">{coverage.uncoveredDays}</b> 天——这几天的结论还没算进来
          </span>
        </>
      )}
    </p>
  );
}
