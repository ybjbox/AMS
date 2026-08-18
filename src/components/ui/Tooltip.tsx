import * as React from 'react';

import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** 提示内容（支持文本或节点） */
  content: React.ReactNode;
  /** 触发元素，通常是一个按钮或图标 */
  children: React.ReactElement<Record<string, unknown>>;
  /** 弹出方向，默认 top */
  side?: Side;
  /** 额外样式类 */
  className?: string;
  /** 显示延迟（毫秒），默认 200 */
  delay?: number;
}

const SIDE_CLASSES: Record<Side, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * 轻量 Tooltip —— 替代散落的 HTML `title=` 属性。
 * 样式完全走设计令牌（bg-popover / text-popover-foreground / ring-border），
 * 暗色由令牌自动切换，无需 dark: 前缀。支持鼠标与键盘聚焦，带 aria-describedby。
 */
export function Tooltip({ content, children, side = 'top', className, delay = 200 }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = React.useId();

  const show = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, [delay]);

  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }, []);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-popover px-2 py-1',
            'text-xs font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10',
            'opacity-100 transition-opacity duration-150',
            SIDE_CLASSES[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export default Tooltip;
