import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 「加载失败」专用态，和「确实没有数据」必须分开。
 *
 * 为什么单独做一个组件：2026-09-26 把非鉴权接口全部打成 500 逐视图取证，发现员工/部门/合同/
 * 文档/待办/审批六处都显示成空态文案 ——「未找到员工，请尝试调整搜索条件」「暂无部门数据，
 * 立即创建」。toast 里的「服务器内部错误」四秒就消失，留在屏幕上的却是"你没数据"，
 * 用户最自然的反应就是重新录一遍（审查报告 M1）。
 */
interface FailedStateProps {
  /** 失败原因（后端给的业务文案优先，没有就用默认） */
  reason?: string | null;
  /** 这是哪一类数据的失败，例如「员工名单」 */
  subject?: string;
  /** 重新拉取；不传则不显示重试按钮 */
  onRetry?: () => void;
  className?: string;
}

export function FailedState({ reason, subject = '数据', onRetry, className }: FailedStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center p-12 text-center', className)}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/25">
        <AlertTriangle className="size-7 text-red-700 dark:text-red-400" aria-hidden="true" />
      </div>
      <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-white">{subject}加载失败</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {reason || '服务未响应或返回了错误。数据仍在服务器上，请重试；持续失败请检查后端状态。'}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw className="size-4" />
          重试
        </Button>
      )}
    </div>
  );
}
