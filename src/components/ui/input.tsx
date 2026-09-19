import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

const Input = React.memo(function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 transition-[color,background-color,border-color,box-shadow] duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-zinc-400 focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-600/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark] dark:placeholder:text-zinc-500 dark:focus-visible:border-brand-400 dark:focus-visible:ring-brand-400/20',
        className
      )}
      {...props}
    />
  );
});

export { Input };
