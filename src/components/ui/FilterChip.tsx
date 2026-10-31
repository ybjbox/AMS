import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Pressable } from './Pressable';

export type FilterChipShape = 'rect' | 'pill';
export type FilterChipSize = 'compact' | 'comfortable';
export type FilterChipTone = 'neutral' | 'danger' | 'warning';

const chipVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-colors duration-quick outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 max-sm:min-h-11',
  {
    variants: {
      shape: {
        rect: 'rounded-md',
        pill: 'rounded-full',
      },
      size: {
        compact: 'h-7 px-2.5 text-xs',
        comfortable: 'h-8 px-3 text-sm',
      },
      active: {
        true: 'border-brand-500 bg-white text-brand-800 shadow-sm dark:border-brand-500/70 dark:bg-zinc-700 dark:text-brand-100',
        false: '',
      },
    },
    compoundVariants: [
      {
        shape: 'rect',
        active: false,
        class: 'border-transparent text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100',
      },
      {
        shape: 'pill',
        active: false,
        class:
          'border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white',
      },
    ],
    defaultVariants: {
      shape: 'rect',
      size: 'compact',
      active: false,
    },
  }
);

const TONE: Record<FilterChipTone, string> = {
  neutral: '',
  danger: 'text-red-700 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
};

export interface FilterChipProps extends Omit<React.ComponentProps<typeof Pressable>, 'children'> {
  active?: boolean;
  shape?: FilterChipShape;
  size?: FilterChipSize;
  tone?: FilterChipTone;
  count?: React.ReactNode;
  children: React.ReactNode;
}

/** 筛选 chip：矩形用于分段组，胶囊用于独立分档；两种形状共用同一选中态。 */
export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  {
    active = false,
    shape = 'rect',
    size = 'compact',
    tone = 'neutral',
    count,
    className,
    type = 'button',
    children,
    ...props
  },
  ref
) {
  return (
    <Pressable
      {...props}
      ref={ref}
      type={type}
      aria-pressed={active}
      data-slot="filter-chip"
      className={cn(chipVariants({ shape, size, active }), !active && TONE[tone], className)}
    >
      {children}
      {count !== undefined && count !== null ? (
        <>
          {' '}
          <span className="font-semibold tabular-nums">{count}</span>
        </>
      ) : null}
    </Pressable>
  );
});
