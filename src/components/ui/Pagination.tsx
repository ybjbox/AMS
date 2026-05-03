import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}
export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  className,
}: PaginationProps) {
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  return (
    <div
      className={cn(
        'px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50 rounded-b-2xl',
        className
      )}
    >
      {/* 桌面端 */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          显示第 <span className="font-medium">{start}</span> 到{' '}
          <span className="font-medium">{end}</span> 条，共{' '}
          <span className="font-medium">{totalItems}</span> 条记录
        </p>
        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="分页">
          <button
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="sr-only">上一页</span>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="relative inline-flex items-center px-4 py-2 border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="sr-only">下一页</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </div>
      {/* 移动端 */}
      <div className="flex items-center justify-between w-full sm:hidden">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">共 {totalItems} 条</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className="inline-flex items-center px-4 py-2 border border-zinc-200/80 dark:border-zinc-600 text-sm font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="inline-flex items-center px-4 py-2 border border-zinc-200/80 dark:border-zinc-600 text-sm font-medium rounded-md text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
