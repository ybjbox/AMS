import React from 'react';
import { Search, Plus, Download, Printer, Filter } from 'lucide-react';
import { DepartmentNode } from '@/types';
import { UserFilters } from './UserFilters';

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
  hasPermission: (permission: string) => boolean;
  setIsAddressBookModalOpen: (isOpen: boolean) => void;
  setIsExportModalOpen: (isOpen: boolean) => void;
  handleAdd: () => void;
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
  hasPermission,
  setIsAddressBookModalOpen,
  setIsExportModalOpen,
  handleAdd,
}: UserToolbarProps) {
  return (
    <>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title">员工管理</h1>
          <p className="page-subtitle">管理企业员工档案、部门分配与权限配置</p>
        </div>
        <div className="toolbar">
          <button
            onClick={() => setIsAddressBookModalOpen(true)}
            className="btn-secondary"
          >
            <Printer className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">导出通讯录</span>
          </button>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="btn-secondary"
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">导出花名册</span>
          </button>
          {hasPermission('users:manage') && (
            <button
              onClick={handleAdd}
              className="btn-primary"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">新增员工</span>
            </button>
          )}
        </div>
      </div>

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
            className="block w-full pl-10 pr-3 py-2.5 border-none rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200 outline-none bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white placeholder-zinc-400"
          />
        </div>
        <div className="flex items-center space-x-2 relative">
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
    </>
  );
}
