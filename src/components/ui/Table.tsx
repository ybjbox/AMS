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
export const TableFrame = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function TableFrame(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn('w-full overflow-auto', className)} {...props} />;
});

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

export type TableDensity = 'compact' | 'comfortable';
export type TableAlign = 'left' | 'center' | 'right';

const DENSITY: Record<TableDensity, string> = {
  compact: 'px-4 py-2',
  comfortable: 'px-6 py-3',
};

/** 表头容器：统一吸顶与背景；不吸顶的表显式传 sticky={false}。 */
export function TableHeader({
  sticky = true,
  className,
  ...props
}: React.ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <thead className={cn('bg-zinc-50 dark:bg-zinc-800/50', sticky && 'sticky top-0 z-20', className)} {...props} />
  );
}

/**
 * 标准表头单元格：字号/字重/字距/底色/下边框/密度只在这里定义。
 * 数字列用 align="right"；首末列用 sticky="left|right"。
 */
export function TableHead({
  density = 'compact',
  align = 'left',
  sticky,
  className,
  ...props
}: React.ComponentProps<'th'> & {
  density?: TableDensity;
  align?: TableAlign;
  sticky?: StickySide;
}) {
  return (
    <th
      className={cn(
        'text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap',
        'bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-700/60',
        DENSITY[density],
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        sticky && cn('sticky z-30', STICKY_SIDE[sticky]),
        className
      )}
      {...props}
    />
  );
}

/**
 * 首/末列冻结的表头单元格（兼容旧调用）。
 * 新代码直接用 TableHead 的 sticky 属性；保留此导出避免外部引用中断。
 */
export function StickyHeaderCell({ side, className, ...props }: React.ComponentProps<'th'> & { side: StickySide }) {
  return <th className={cn('sticky z-30', STICKY_SIDE[side], className)} {...props} />;
}

/** 首/末列冻结的数据单元格；层级 10 保证在横向滚动时压住普通单元格。 */
export function StickyCell({ side, className, ...props }: React.ComponentProps<'td'> & { side: StickySide }) {
  return <td className={cn('sticky z-10', STICKY_SIDE[side], className)} {...props} />;
}
