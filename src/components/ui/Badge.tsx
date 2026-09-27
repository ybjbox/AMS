import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'destructive'
  | 'neutral'
  | 'primary';

const variantClasses: Record<BadgeVariant, string> = {
  // 对比度对齐：浅色模式下用深色文字（≈700 级），保证 12px 徽章达 WCAG AA。
  // success 必须是 emerald：契约里 emerald=状态、brand 蓝=品牌/选中，此前亮色写成品牌蓝，
  // 于是同一个「在职」在员工列表里是蓝的、在档案弹窗的手写 pill 里是绿的（2026-09-26 审查 D3）。
  // 原 info 变体与 primary 视觉完全相同且零调用点，删掉以免又多一个同色别名。
  success: 'bg-emerald-50 text-emerald-700 dark:bg-success/10 dark:text-success',
  warning: 'bg-amber-50 text-amber-700 dark:bg-warning/10 dark:text-warning',
  destructive: 'bg-red-50 text-red-700 dark:bg-destructive/10 dark:text-destructive',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

/**
 * 统一语义徽章：替代全站 30+ 处手写的
 * `inline-flex px-3 py-1 rounded-full text-xs font-medium` + 散落语义色。
 * 暗色由令牌（success/warning/... 在 .dark 均有定义）自动切换，无需 dark: 前缀。
 */
export function Badge({ variant = 'neutral', children, className = '', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
