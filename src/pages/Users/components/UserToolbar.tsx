import React from 'react';
import { Search, Filter } from 'lucide-react';
import { DepartmentNode } from '@/types';
import { UserFilters } from './UserFilters';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
          <Input
            type="text"
            placeholder="搜索姓名、工号或部门…"
            aria-label="搜索姓名、工号或部门"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center space-x-2 relative w-full sm:w-auto">
          {/* 移动端：底部 Sheet（< md） */}
          <div className="md:hidden w-full">
            <Sheet>
              <SheetTrigger
                className={`w-full inline-flex justify-center items-center px-4 py-2.5 rounded-xl text-sm font-medium transition duration-300 ${
                  activeFilterCount > 0
                    ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 shadow-sm'
                    : 'text-zinc-700 dark:text-zinc-200 bg-zinc-100/50 dark:bg-zinc-800 hover:bg-zinc-200/50 dark:hover:bg-zinc-700'
                }`}
              >
                <Filter className={`h-4 w-4 mr-2 ${activeFilterCount > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400'}`} />
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`h-auto gap-2 rounded-xl px-4 py-2.5 ${
                activeFilterCount > 0 || isFilterOpen
                  ? 'border-brand-500/40 bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-900/20 dark:text-brand-400'
                  : 'text-zinc-700 dark:text-zinc-200'
              }`}
            >
              <Filter
                className={`h-4 w-4 ${activeFilterCount > 0 || isFilterOpen ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400'}`}
              />
              筛选 {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Button>

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
