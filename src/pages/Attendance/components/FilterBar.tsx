import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { RecordFilter, RecordSourceFilter } from '../lib/filters';
import { ANOMALY_GROUPS } from '../lib/filters';
import type { AnomalyGroup } from '../lib/filters';
import { DATE_PRESETS, describeRange, presetRange } from '../lib/datePresets';
import type { DatePresetId } from '../lib/datePresets';

const SOURCE_OPTIONS: { id: RecordSourceFilter; label: string }[] = [
  { id: 'all', label: '全部来源' },
  { id: 'wecom', label: '企业微信' },
  { id: 'manual', label: '补卡/导入' },
];

export interface RecordsFilterBarProps {
  filter: RecordFilter;
  onChange: (patch: Partial<RecordFilter>) => void;
  onReset: () => void;
  active: boolean;
  matched: number;
  total: number;
  /** 当前命中的快捷区间；用户手改过日期就为 null（按钮不高亮） */
  activePreset: DatePresetId | null;
  onPreset: (id: DatePresetId) => void;
  /** 区间是否前后各多留一天 */
  padDays: boolean;
  onPadDaysChange: (v: boolean) => void;
}

/**
 * 打卡记录筛选栏。
 *
 * 为什么必须有：1897 条记录原来只能一页页翻，且整个模块唯一的搜索框只在
 * 「异常分析」标签出现 —— 想找某个人的打卡得点进异常分析、搜、再自己判断
 * 那是名字不是异常描述。日期区间同样是刚需（核对某个月、找某人某天的漏打卡）。
 *
 * 日期用原生 date：这里要的是键盘可输入 + 原生日历，样式由 CSS 契约统一
 * （暗色补 dark:[color-scheme:dark]）。不用 Select —— 月份是连续区间不是枚举。
 */
export function RecordsFilterBar({
  filter,
  onChange,
  onReset,
  active,
  matched,
  total,
  activePreset,
  onPreset,
  padDays,
  onPadDaysChange,
}: RecordsFilterBarProps) {
  // 预设区间要相对"今天"算，所以每次渲染取当前时间即可（不必放进 state：
  // 用户开着页面跨过午夜也不会要求预设自动重算，手点一下就刷新）
  const today = new Date();
  return (
    <div className="card-base p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="relative lg:w-64">
          <label htmlFor="att-q" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            姓名或工号
          </label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-zinc-400" aria-hidden="true" />
          <Input
            id="att-q"
            type="text"
            placeholder="例如：李 或 1001"
            value={filter.query}
            onChange={(e) => onChange({ query: e.target.value })}
            className="pl-9"
          />
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="att-from" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              开始日期
            </label>
            <Input
              id="att-from"
              type="date"
              value={filter.dateFrom}
              max={filter.dateTo || undefined}
              onChange={(e) => onChange({ dateFrom: e.target.value })}
              className="w-[9.5rem] dark:[color-scheme:dark]"
            />
          </div>
          <span className="pb-2.5 text-sm text-muted-foreground" aria-hidden="true">
            —
          </span>
          <div>
            <label htmlFor="att-to" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              结束日期
            </label>
            <Input
              id="att-to"
              type="date"
              value={filter.dateTo}
              min={filter.dateFrom || undefined}
              onChange={(e) => onChange({ dateTo: e.target.value })}
              className="w-[9.5rem] dark:[color-scheme:dark]"
            />
          </div>
        </div>

        {/* 快捷区间：手填日期框对"看上个月"这种最常见的诉求太慢。
            预设清单在 lib/datePresets.ts，增删区间只改那里。 */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">快捷区间</span>
            <div
              className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800"
              role="group"
              aria-label="按时间区间快捷筛选"
            >
              {DATE_PRESETS.map((p) => {
                const isActive = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onPreset(p.id)}
                    title={`${describeRange(presetRange(p.id, today, padDays).from, presetRange(p.id, today, padDays).to)}`}
                    className={[
                      'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 max-sm:min-h-11',
                      isActive
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                        : 'text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100',
                    ].join(' ')}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* 跨零点班次（17:30-01:00）会让月初/月末那班横跨两天，
              默认多留一天才不漏；想看严格的自然月就把它关掉。 */}
          <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-2xs text-muted-foreground">
            <input
              type="checkbox"
              checked={padDays}
              onChange={(e) => onPadDaysChange(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            边界多留一天
          </label>
        </div>

        <div className="lg:flex-1" />

        <div className="flex items-end gap-2">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">来源</span>
            <div className="inline-flex flex-wrap rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="group" aria-label="按来源筛选">
              {SOURCE_OPTIONS.map((opt) => {
                const isActive = filter.source === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onChange({ source: opt.id })}
                    className={[
                      'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 max-sm:min-h-11',
                      isActive
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                        : 'text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {active && (
            <Button variant="ghost" size="sm" onClick={onReset} className="h-9">
              <X className="h-4 w-4" />
              清除
            </Button>
          )}
        </div>
      </div>

      {active && (
        <p className="mt-3 border-t border-zinc-100 pt-2.5 text-2xs text-muted-foreground dark:border-zinc-700/60 tabular-nums">
          命中 {matched} / {total} 条
        </p>
      )}
    </div>
  );
}

export interface AnomalyFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  group: AnomalyGroup;
  onGroupChange: (g: AnomalyGroup) => void;
  counts: Record<AnomalyGroup, number>;
}

/**
 * 异常筛选：搜索 + 按处置方式分组。
 *
 * 五个枚举值直接罗列没有意义 —— LATE_5 / LATE_15 都是迟到，MISSING_IN /
 * MISSING_OUT 都是缺卡。所以按"要采取什么动作"折成三档，每档带条数，
 * 打开就能看出这批异常里主要是哪一类问题。
 */
export function AnomalyFilterBar({ query, onQueryChange, group, onGroupChange, counts }: AnomalyFilterBarProps) {
  return (
    <div className="card-base p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative sm:w-72">
          <label htmlFor="anom-q" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            姓名或工号
          </label>
          <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-zinc-400" aria-hidden="true" />
          <Input
            id="anom-q"
            type="text"
            placeholder="搜索姓名或工号…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">异常类型</span>
          <div className="inline-flex flex-wrap rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="group" aria-label="按异常类型筛选">
            {ANOMALY_GROUPS.map((g) => {
              const isActive = group === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onGroupChange(g.id)}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200',
                    isActive
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                      : 'text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100',
                  ].join(' ')}
                >
                  {g.label}
                  {/* 计数是信息，不靠透明度弱化：opacity-70 实测对比度不足 4.5:1（access-2） */}
                  <span className="tabular-nums">{counts[g.id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}