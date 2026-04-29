import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  itemsPerPage,
  onPageChange,
  className = '',
}: PaginationProps) {
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalCount);

  return (
    <div className={`flex items-center justify-between px-4 py-3 sm:px-6 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 rounded-b-2xl shrink-0 ${className}`}>
      {/* 移动端视图 */}
      <div className="flex flex-1 items-center justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="btn-icon"
          aria-label="上一页"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {totalPages === 0 ? 0 : currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || totalPages === 0}
          className="btn-icon"
          aria-label="下一页"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 桌面端视图 */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            显示第 <span className="font-medium text-zinc-900 dark:text-white">{startItem}</span> 到{' '}
            <span className="font-medium text-zinc-900 dark:text-white">{endItem}</span> 条，共{' '}
            <span className="font-medium text-zinc-900 dark:text-white">{totalCount}</span> 条
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="btn-icon"
            aria-label="上一页"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || totalPages === 0}
            className="btn-icon"
            aria-label="下一页"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
