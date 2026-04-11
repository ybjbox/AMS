import React from 'react';
import { Check } from 'lucide-react';
import { TreeFilter } from '../../../components/common/TreeFilter';
import { DepartmentNode } from '../../../types';

interface UserFiltersProps {
  filters: { department: string[]; status: string[] };
  handleFilterChange: (key: 'department' | 'status', value: string) => void;
  departments: DepartmentNode[];
  activeFilterCount: number;
  clearFilters: () => void;
  setIsFilterOpen: (isOpen: boolean) => void;
}

export function UserFilters({
  filters,
  handleFilterChange,
  departments,
  activeFilterCount,
  clearFilters,
  setIsFilterOpen,
}: UserFiltersProps) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)} />
      <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-xs sm:max-w-none bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">高级筛选</h3>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              清除全部
            </button>
          )}
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">所属部门</label>
            <TreeFilter
              nodes={departments}
              selectedValues={filters.department || []}
              onToggle={(deptName) => handleFilterChange('department', deptName)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">员工状态</label>
            <div className="flex gap-2">
              {['在职', '试用期', '离职'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleFilterChange('status', status)}
                  className={`flex-1 flex items-center justify-center px-2 py-2 rounded-md text-xs font-medium transition-colors border whitespace-nowrap ${
                    (filters.status || []).includes(status)
                      ? status === '在职'
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                        : status === '试用期'
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                          : 'bg-slate-100 dark:bg-slate-800 border-zinc-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                      : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                  }`}
                >
                  {(filters.status || []).includes(status) && <Check className="h-3 w-3 mr-1 shrink-0" />}
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
