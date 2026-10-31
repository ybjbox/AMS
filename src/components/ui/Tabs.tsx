import * as React from 'react';
import { cn } from '@/lib/utils';
import { Pressable } from './Pressable';

export type TabsVariant = 'page' | 'segmented' | 'filter';
export type TabsOrientation = 'horizontal' | 'vertical';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  variant: TabsVariant;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('Tabs 子组件必须在 <Tabs> 内使用');
  return context;
}

const TabListContext = React.createContext<TabsOrientation>('horizontal');

const LIST_CLASSES: Record<TabsVariant, Record<TabsOrientation, string>> = {
  page: {
    horizontal:
      'flex items-center rounded-xl bg-zinc-100/80 p-1 dark:bg-zinc-800/80 overflow-x-auto no-scrollbar max-lg:flex-wrap',
    vertical: 'space-y-1',
  },
  segmented: {
    horizontal: 'flex w-full flex-wrap gap-y-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-700/50',
    vertical: 'flex w-full flex-col gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-700/50',
  },
  filter: {
    horizontal: 'flex gap-1',
    vertical: 'flex flex-col gap-1',
  },
};

const TAB_BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[color,background-color,box-shadow] duration-quick outline-none select-none cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 max-sm:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0';

const TAB_CLASSES: Record<TabsVariant, Record<TabsOrientation, { base: string; active: string; inactive: string }>> = {
  page: {
    horizontal: {
      base: 'rounded-lg px-4 py-1.5 text-sm [&_svg]:size-3.5',
      active: 'bg-white text-zinc-900 shadow-sm ring-1 ring-brand-500/40 dark:bg-zinc-700 dark:text-white',
      inactive:
        'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-200',
    },
    vertical: {
      base: 'w-full justify-start rounded-lg px-3 py-2.5 text-sm [&_svg]:size-5 [&_svg]:text-zinc-400 dark:[&_svg]:text-zinc-500',
      active:
        'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-400 [&_svg]:text-brand-700 dark:[&_svg]:text-brand-400',
      inactive:
        'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white',
    },
  },
  segmented: {
    horizontal: {
      base: 'flex-1 rounded-md px-3 py-1.5 text-xs [&_svg]:size-3.5',
      active: 'bg-white text-brand-600 shadow-sm dark:bg-zinc-800 dark:text-brand-400',
      inactive: 'text-muted-foreground hover:text-foreground',
    },
    vertical: {
      base: 'flex-1 rounded-md px-3 py-1.5 text-xs [&_svg]:size-3.5',
      active: 'bg-white text-brand-600 shadow-sm dark:bg-zinc-800 dark:text-brand-400',
      inactive: 'text-muted-foreground hover:text-foreground',
    },
  },
  filter: {
    horizontal: {
      base: 'min-h-11 rounded-lg px-3 text-sm',
      active: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
      inactive: 'text-muted-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800',
    },
    vertical: {
      base: 'min-h-11 rounded-lg px-3 text-sm',
      active: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
      inactive: 'text-muted-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800',
    },
  },
};

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  variant?: TabsVariant;
  children: React.ReactNode;
}

/** 页签上下文：只提供选中值与变体，不额外包 DOM。 */
export function Tabs({ value, onValueChange, variant = 'page', children }: TabsProps) {
  return <TabsContext.Provider value={{ value, onValueChange, variant }}>{children}</TabsContext.Provider>;
}

export interface TabListProps extends React.HTMLAttributes<HTMLElement> {
  orientation?: TabsOrientation;
  as?: 'div' | 'nav';
}

export function TabList({
  orientation = 'horizontal',
  as: Component = 'div',
  className,
  onKeyDown,
  children,
  ...props
}: TabListProps) {
  const tabs = useTabsContext();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const vertical = orientation === 'vertical';
    const [previousKey, nextKey] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (![previousKey, nextKey, 'Home', 'End'].includes(event.key)) return;

    const target = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!target || !event.currentTarget.contains(target)) return;

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
    const currentIndex = items.indexOf(target);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === previousKey) nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === nextKey) nextIndex = (currentIndex + 1) % items.length;

    const next = items[nextIndex];
    if (!next) return;

    event.preventDefault();
    next.focus();
    const nextValue = next.dataset.value;
    if (nextValue !== undefined) tabs.onValueChange(nextValue);
  };

  const List = Component as React.ElementType;

  return (
    <List
      {...props}
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(LIST_CLASSES[tabs.variant][orientation], className)}
    >
      <TabListContext.Provider value={orientation}>{children}</TabListContext.Provider>
    </List>
  );
}

export interface TabProps extends Omit<React.ComponentProps<typeof Pressable>, 'role' | 'aria-selected' | 'tabIndex'> {
  value: string;
}

export function Tab({ value, className, onClick, type = 'button', children, ...props }: TabProps) {
  const tabs = useTabsContext();
  const orientation = React.useContext(TabListContext);
  const active = tabs.value === value;
  const classes = TAB_CLASSES[tabs.variant][orientation];

  return (
    <Pressable
      {...props}
      type={type}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-value={value}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) tabs.onValueChange(value);
      }}
      className={cn(TAB_BASE, classes.base, active ? classes.active : classes.inactive, className)}
    >
      {children}
    </Pressable>
  );
}
