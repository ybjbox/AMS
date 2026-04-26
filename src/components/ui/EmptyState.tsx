import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-12 text-center', className)}>
      {/* 装饰性背景圆圈 */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-zinc-50 dark:bg-zinc-700 flex items-center justify-center">
            <Icon className="w-8 h-8 text-zinc-300 dark:text-zinc-500" />
          </div>
        </div>
        {/* 装饰点 */}
        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-blue-100 dark:bg-blue-900/40" />
        <div className="absolute bottom-2 left-0 w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
