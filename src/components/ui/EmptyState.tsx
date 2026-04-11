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
      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-300 dark:text-slate-500" />
      </div>
      <h3 className="text-slate-900 dark:text-white font-medium">{title}</h3>
      <p className="text-muted-foreground text-sm mt-1 mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
