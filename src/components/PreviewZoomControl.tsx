import React from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, ZOOM_DEFAULT } from '@/hooks/usePreviewZoom';

/**
 * 预览缩放的加减控件：− 百分比 + 一键回 100%。
 * 只作用于屏幕渲染（CSS zoom），不改任何毫米/px 版面值，所以打印产物与它无关。
 * 生效比例的算法（zoomStyle / iframeZoomStyle）在 @/hooks/usePreviewZoom，
 * 那个模块同时管存比例，控件与算法分开放是为了不破坏 Fast Refresh 的"一个文件只导出组件"。
 */
export function PreviewZoomControl({
  zoom,
  onChange,
  onReset,
  className,
}: {
  zoom: number;
  onChange: (next: number) => void;
  onReset?: () => void;
  className?: string;
}) {
  const reset = onReset ?? (() => onChange(ZOOM_DEFAULT));
  return (
    <div
      role="group"
      aria-label="预览缩放"
      className={cn('flex shrink-0 items-center gap-0.5 normal-case tracking-normal', className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="缩小预览"
        title="缩小预览"
        disabled={zoom <= ZOOM_MIN}
        onClick={() => onChange(zoom - ZOOM_STEP)}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-11 text-center text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
        {zoom}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="放大预览"
        title="放大预览"
        disabled={zoom >= ZOOM_MAX}
        onClick={() => onChange(zoom + ZOOM_STEP)}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="恢复 100%"
        title="恢复 100%"
        disabled={zoom === ZOOM_DEFAULT}
        onClick={reset}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
