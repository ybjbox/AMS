import { useState, useMemo, useCallback } from 'react';
import { User } from '../../../types';

export function useUserFilters(users: User[]) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<{ department: string[]; status: string[] }>({
    department: [],
    status: [],
  });

  const itemsPerPage = 10;

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
  const currentUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleFilterChange = useCallback((key: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const currentValues = prev[key] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return { ...prev, [key]: newValues };
    });
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ department: [], status: [] });
    setCurrentPage(1);
  }, []);

  const activeFilterCount = filters.department.length + filters.status.length;

  return {
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    isFilterOpen,
    setIsFilterOpen,
    filters,
    filteredUsers,
    currentUsers,
    totalPages,
    itemsPerPage,
    handleFilterChange,
    clearFilters,
    activeFilterCount,
  };
}
