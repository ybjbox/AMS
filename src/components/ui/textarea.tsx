import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.memo(function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 transition-[color,background-color,border-color,box-shadow] duration-200 outline-none placeholder:text-zinc-400 focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-600/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark] dark:placeholder:text-zinc-500 dark:focus-visible:border-brand-400 dark:focus-visible:ring-brand-400/20',
        className
      )}
      {...props}
    />
  );
});

export { Textarea };
