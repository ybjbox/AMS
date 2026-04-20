import React, { memo } from 'react';

export const Skeleton = memo(function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700 ${className || ''}`} {...props} />;
});

export const TableSkeleton = memo(function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-zinc-200 dark:border-zinc-700 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => {
            // Use a deterministic pseudo-random width based on row and col index for visual variety
            const widths = ['w-1/2', 'w-2/3', 'w-3/4', 'w-full', 'w-4/5'];
            const randomWidth = widths[(rowIndex + colIndex) % widths.length];
            return (
              <td key={colIndex} className="px-6 py-4 whitespace-nowrap">
                <Skeleton className={`h-4 ${randomWidth}`} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
});
