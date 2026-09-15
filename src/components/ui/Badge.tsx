import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'destructive'
  | 'neutral'
  | 'primary'
  | 'info';

const variantClasses: Record<BadgeVariant, string> = {
  // 对比度对齐：浅色模式下用深色文字（≈600 级），保证 12px 徽章达 WCAG AA
  success: 'bg-emerald-50 text-emerald-700 dark:bg-success/10 dark:text-success',
  warning: 'bg-amber-50 text-amber-700 dark:bg-warning/10 dark:text-warning',
  destructive: 'bg-red-50 text-red-700 dark:bg-destructive/10 dark:text-destructive',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  info: 'bg-primary/10 text-primary',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * 统一语义徽章：替代全站 30+ 处手写的
 * `inline-flex px-3 py-1 rounded-full text-xs font-medium` + 散落语义色。
 * 暗色由令牌（success/warning/... 在 .dark 均有定义）自动切换，无需 dark: 前缀。
 */
export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
