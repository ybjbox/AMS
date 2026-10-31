import * as React from 'react';
import { cn } from '@/lib/utils';

type StickySide = 'left' | 'right';

const STICKY_SIDE: Record<StickySide, string> = {
  left: 'left-0 shadow-sticky-left',
  right: 'right-0 shadow-sticky-right',
};

/**
 * 宽表滚动容器：横向滚动只发生在这一层，页面本身不滚（MASTER 响应式硬规则）。
 * 需要接虚拟滚动时把 ref 传进来即可。
 */
export const TableFrame = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function TableFrame({ className, ...props }, ref) {
    return <div ref={ref} className={cn('w-full overflow-auto', className)} {...props} />;
  }
);

/**
 * 表格基座：默认铺满、左对齐、不设下限；宽表再按需给 minWidth 与 nowrapHeaders。
 * 调用方不要再写 w-full / border-collapse，也不要用 JS 把列宽总和写死成像素宽度。
 */
export function Table({
  className,
  minWidth,
  nowrapHeaders = false,
  ...props
}: React.ComponentProps<'table'> & { minWidth?: string; nowrapHeaders?: boolean }) {
  return (
    <table
      className={cn(
        'w-full border-collapse text-left',
        nowrapHeaders && '[&_th]:whitespace-nowrap',
        minWidth,
        className
      )}
      {...props}
    />
  );
}

/**
 * 首/末列冻结的表头单元格。
 * 背景色、内边距、hover 仍由调用方给 —— 表头底色、暗色、行悬停各表不同；
 * 这里只固定 sticky 定位、层级与阴影，避免每张表各写一套组合。
 */
export function StickyHeaderCell({
  side,
  className,
  ...props
}: React.ComponentProps<'th'> & { side: StickySide }) {
  return <th className={cn('sticky z-30', STICKY_SIDE[side], className)} {...props} />;
}

/** 首/末列冻结的数据单元格；层级 10 保证在横向滚动时压住普通单元格。 */
export function StickyCell({ side, className, ...props }: React.ComponentProps<'td'> & { side: StickySide }) {
  return <td className={cn('sticky z-10', STICKY_SIDE[side], className)} {...props} />;
}
