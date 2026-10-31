import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  title?: string;
  description?: ReactNode;
  icon?: ElementType;
  actions?: ReactNode;
  /** content：正文滚动；none：桌面表体占满剩余高度，小屏改为正文整体滚动 */
  scroll?: 'content' | 'none';
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export default function SettingsPanel({
  title,
  description,
  icon: Icon,
  actions,
  scroll = 'content',
  className,
  bodyClassName,
  children,
}: SettingsPanelProps) {
  return (
    <section className={cn('flex h-full min-h-0 flex-col gap-5 p-6 animate-in fade-in duration-slow', className)}>
      {title ? (
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="section-title flex items-center gap-2">
              {Icon ? <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" /> : null}
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      <div
        className={cn(
          'min-h-0 flex-1',
          scroll === 'content'
            ? 'space-y-6 overflow-y-auto'
            : 'flex flex-col max-md:block max-md:space-y-4 max-md:overflow-y-auto',
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}
