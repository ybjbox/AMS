import React from 'react';
import { Search, Filter } from 'lucide-react';
import { DepartmentNode } from '@/types';
import { UserFilters } from './UserFilters';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface UserToolbarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isFilterOpen: boolean;
  setIsFilterOpen: (isOpen: boolean) => void;
  activeFilterCount: number;
  clearFilters: () => void;
  filters: { department: string[]; status: string[] };
  handleFilterChange: (key: 'department' | 'status', value: string) => void;
  departments: DepartmentNode[];
}

export function UserToolbar({
  searchTerm,
  setSearchTerm,
  isFilterOpen,
  setIsFilterOpen,
  activeFilterCount,
  clearFilters,
  filters,
  handleFilterChange,
  departments,
}: UserToolbarProps) {
  return (
    <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-700">
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-zinc-400" />
          </div>
          <input
            type="text"
            placeholder="搜索姓名、工号或部门..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-base pl-10"
          />
        </div>
        <div className="flex items-center space-x-2 relative w-full sm:w-auto">
          {/* 移动端：底部 Sheet（< md） */}
          <div className="md:hidden w-full">
            <Sheet>
              <SheetTrigger
                className={`w-full inline-flex justify-center items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeFilterCount > 0
                    ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                    : 'text-zinc-700 dark:text-zinc-200 bg-zinc-100/50 dark:bg-zinc-800 hover:bg-zinc-200/50 dark:hover:bg-zinc-700'
                }`}
              >
                <Filter className={`h-4 w-4 mr-2 ${activeFilterCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`} />
                筛选 {activeFilterCount > 0 && `(${activeFilterCount})`}
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl overflow-y-auto">
                <div className="py-2">
                  <UserFilters
                    filters={filters}
                    handleFilterChange={handleFilterChange}
                    departments={departments}
                    activeFilterCount={activeFilterCount}
                    clearFilters={clearFilters}
                    setIsFilterOpen={() => {}}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* 桌面端：绝对定位浮层（>= md），原有逻辑保持不变 */}
          <div className="hidden md:block relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeFilterCount > 0 || isFilterOpen
                  ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                  : 'text-zinc-700 dark:text-zinc-200 bg-zinc-100/50 dark:bg-zinc-800 hover:bg-zinc-200/50 dark:hover:bg-zinc-700'
              }`}
            >
              <Filter
                className={`h-4 w-4 mr-2 ${activeFilterCount > 0 || isFilterOpen ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}
              />
              筛选 {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>

            {isFilterOpen && (
              <UserFilters
                filters={filters}
                handleFilterChange={handleFilterChange}
                departments={departments}
                activeFilterCount={activeFilterCount}
                clearFilters={clearFilters}
                setIsFilterOpen={setIsFilterOpen}
              />
            )}
          </div>
        </div>
      </div>
  );
}
