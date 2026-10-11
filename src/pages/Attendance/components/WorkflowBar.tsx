import React from 'react';
import { Check, CircleAlert, ChevronRight } from 'lucide-react';
import type { WorkflowStep, StepState } from '../lib/workflow';
import type { TabType } from '../hooks/useAttendance';

/**
 * 四步工作流条：①配部门时段 → ②打卡记录 → ③异常分析 → ④月度报表
 *
 * 为什么要有它：考勤是一条**有前置依赖**的流水线，但原来只有四个平铺的标签，
 * 前置条件（部门时段）夹在第二位，而且藏在一个 20 多 KB 的配置表后面。
 * 新人第一次打开这个模块只看到「1897 条打卡 / 0 条异常」，完全分不清
 * "异常为 0" 是还没分析、还是分析过确实没人异常 —— 页面底部的空状态
 * 写了这句话，但它藏在只有"0 条异常"时才出现的分支里。
 *
 * 这条把"走到哪一步、哪一步还欠什么"摆在最上面，且**每一步都能直接点**：
 * 不是强制线性向导（那样会挡住只想看月报的老用户），是可跳过的进度指示。
 */

export interface WorkflowBarProps {
  steps: WorkflowStep[];
  activeTab: TabType;
  /** 某一步要求打开配置弹窗而不是切标签（第①步「配部门时段」） */
  onSelect: (tab: TabType) => void;
  onOpenDialog: () => void;
}

/** 状态 → 语义色与文案。blocked 用 amber（该你处理了），done 用 emerald。 */
const STATE_META: Record<StepState, { label: string; dot: string; text: string }> = {
  todo: { label: '待处理', dot: 'bg-zinc-300 dark:bg-zinc-600', text: 'text-muted-foreground' },
  ready: { label: '可进行', dot: 'bg-brand-500', text: 'text-brand-700 dark:text-brand-300' },
  done: { label: '已完成', dot: 'bg-emerald-600 dark:bg-emerald-400', text: 'text-emerald-700 dark:text-emerald-400' },
  blocked: { label: '缺前置', dot: 'bg-amber-600 dark:bg-amber-400', text: 'text-amber-700 dark:text-amber-400' },
};

const ICON_TONE: Record<StepState, string> = {
  todo: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  ready: 'bg-brand-600 text-white dark:bg-brand-500',
  done: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  blocked: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export default function WorkflowBar({ steps, activeTab, onSelect, onOpenDialog }: WorkflowBarProps) {
  return (
    <nav aria-label="考勤作业流程" className="card-base p-3 sm:p-4">
      {/* 窄屏纵向堆叠：横向四步在 375px 下每步只剩 ~80px，"缺前置 · 尚未导入"根本放不下 */}
      <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
        {steps.map((step, i) => {
          const isActive = !step.opensDialog && step.tab === activeTab;
          const meta = STATE_META[step.state];
          return (
            <li key={step.tab} className="flex min-w-0 flex-1 items-stretch">
              <button
                type="button"
                onClick={() => (step.opensDialog ? onOpenDialog() : onSelect(step.tab as TabType))}
                aria-current={isActive ? 'step' : undefined}
                title={step.opensDialog ? '打开部门工作时段配置' : undefined}
                className={[
                  'group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                  'transition-colors duration-200',
                  isActive
                    ? 'bg-brand-50 ring-1 ring-brand-500/40 dark:bg-brand-900/25 dark:ring-brand-400/40'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/40',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isActive ? ICON_TONE.ready : ICON_TONE[step.state]
                  }`}
                >
                  {step.state === 'done' ? (
                    <Check className="h-4 w-4" />
                  ) : step.state === 'blocked' ? (
                    <CircleAlert className="h-4 w-4" />
                  ) : (
                    <span className="tabular-nums">{step.index}</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-medium ${
                      isActive
                        ? 'text-brand-800 dark:text-brand-200'
                        : step.opensDialog
                          ? 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50'
                          : 'text-zinc-900 dark:text-white'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                    <span className={`truncate text-2xs ${meta.text}`}>
                      {meta.label} · {step.detail}
                    </span>
                  </span>
                </span>

                {i < steps.length - 1 && (
                  <ChevronRight
                    className="hidden h-4 w-4 shrink-0 text-zinc-300 sm:block dark:text-zinc-600"
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}