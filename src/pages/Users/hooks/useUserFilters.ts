import { useMemo, useCallback, useState } from 'react';
import { User } from '@/types';
import { useUrlState } from '@/hooks/useUrlState';

/** 可选的每页条数（表格页通用） */
export const PER_PAGE_OPTIONS = [10, 20, 50] as const;
export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];

export function useUserFilters(users: User[]) {
  const urlState = useUrlState();

  // URL 是唯一事实来源：搜索词 / 部门筛选 / 状态筛选 / 页码全部从 query 恢复
  const searchTerm = urlState.get('q');
  const currentPage = urlState.getNumber('page', 1);
  const selectedDepartments = urlState.getAll('dept');
  const selectedStatuses = urlState.getAll('status');

  const filters = useMemo(
    () => ({ department: selectedDepartments, status: selectedStatuses }),
    [selectedDepartments, selectedStatuses]
  );

  // 每页条数（URL 可调，默认 10）
  const rawPerPage = urlState.getNumber('per', 10);
  const itemsPerPage: number = (PER_PAGE_OPTIONS as readonly number[]).includes(rawPerPage) ? rawPerPage : 10;

  const setItemsPerPage = useCallback(
    (n: number) => {
      urlState.set({ per: n === 10 ? null : n, page: null });
    },
    [urlState]
  );

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        (u.name || '').includes(searchTerm) ||
        (u.id || '').includes(searchTerm) ||
        (u.department || '').includes(searchTerm);

      const matchesDept = filters.department.length > 0 ? filters.department.includes(u.department || '') : true;
      const matchesStatus = filters.status.length > 0 ? filters.status.includes(u.status || '') : true;

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [searchTerm, filters, users]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  // 页码越界保护（筛选后页数变少时自动回到有效范围）
  const safePage = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1));
  const currentUsers = filteredUsers.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const setSearchTerm = useCallback(
    (term: string) => {
      urlState.set({ q: term, page: null });
    },
    [urlState]
  );

  const setCurrentPage = useCallback(
    (page: number) => {
      urlState.set({ page: page <= 1 ? null : page });
    },
    [urlState]
  );

  const handleFilterChange = useCallback(
    (key: keyof typeof filters, value: string) => {
      const currentValues = filters[key] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      urlState.set({ [key]: newValues.length > 0 ? newValues : null, page: null });
    },
    [filters, urlState]
  );

  const clearFilters = useCallback(() => {
    urlState.set({ dept: null, status: null, page: null });
  }, [urlState]);

  const activeFilterCount = filters.department.length + filters.status.length;

  // 桌面端筛选浮层的开关仍为本地 UI 状态（不属于可分享视图状态）
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return {
    searchTerm,
    setSearchTerm,
    currentPage: safePage,
    setCurrentPage,
    isFilterOpen,
    setIsFilterOpen,
    filters,
    filteredUsers,
    currentUsers,
    totalPages,
    itemsPerPage,
    setItemsPerPage,
    handleFilterChange,
    clearFilters,
    activeFilterCount,
  };
}
