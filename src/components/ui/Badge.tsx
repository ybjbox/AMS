import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'destructive'
  | 'neutral'
  | 'primary'
  | 'info';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
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
