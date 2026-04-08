import { useState, useCallback } from 'react';
import { User, DepartmentNode, RoleNode } from '../../../types';

export interface Table {
  number: number;
  members: any[];
}

export interface TableCapacity {
  id: string;
  tableNumber: number;
  capacity: number;
}

export function useSeatingArrange(
  activeUsers: User[],
  selectedUserIds: Set<string>,
  departments: DepartmentNode[],
  roles: RoleNode[]
) {
  const [tableCapacities, setTableCapacities] = useState<TableCapacity[]>([
    { id: Math.random().toString(36), tableNumber: 1, capacity: 10 }
  ]);
  const [tables, setTables] = useState<Table[]>([]);
  const [skippedNumbers, setSkippedNumbers] = useState<string>('4,14,24');

  const addTableCapacity = useCallback(() => {
    setTableCapacities(prev => {
      const lastCapacity = prev[prev.length - 1]?.capacity || 10;
      const maxNumber = prev.reduce((max, tc) => Math.max(max, tc.tableNumber), 0);
      let nextNum = maxNumber + 1;
      const skipped = new Set(skippedNumbers.split(/[,，]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n)));
      while (skipped.has(nextNum)) {
        nextNum++;
      }
      return [...prev, { id: Math.random().toString(36), tableNumber: nextNum, capacity: lastCapacity }];
    });
  }, [skippedNumbers]);

  const updateTableCapacity = useCallback((id: string, value: number) => {
    setTableCapacities(prev => prev.map(tc => tc.id === id ? { ...tc, capacity: Math.max(1, value) } : tc));
  }, []);

  const removeTableCapacity = useCallback((id: string) => {
    setTableCapacities(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(tc => tc.id !== id);
    });
  }, []);

  const handleAutoArrange = useCallback(() => {
    // 1. 获取部门和职位的优先级映射
    const deptPriorityMap: Record<string, number> = {};
    const rolePriorityMap: Record<string, number> = {};

    const traverseDepts = (nodes: any[]) => {
      nodes.forEach(node => {
        deptPriorityMap[node.name] = node.priority || 0;
        if (node.children) traverseDepts(node.children);
      });
    };
    traverseDepts(departments);

    roles.forEach(role => {
      rolePriorityMap[role.name] = role.priority || 0;
    });

    // 2. 排序逻辑
    const usersToArrange = activeUsers.filter(u => selectedUserIds.has(u.id));
    const sortedUsers = [...usersToArrange].sort((a, b) => {
      const aDeptPrio = deptPriorityMap[a.department || ''] || 0;
      const bDeptPrio = deptPriorityMap[b.department || ''] || 0;

      if (aDeptPrio !== bDeptPrio) {
        return bDeptPrio - aDeptPrio; // 部门优先级高的排前面
      }

      const aRolePrio = rolePriorityMap[a.role || ''] || 0;
      const bRolePrio = rolePriorityMap[b.role || ''] || 0;

      if (aRolePrio !== bRolePrio) {
        return bRolePrio - aRolePrio; // 职位优先级高的排前面
      }

      // 如果优先级相同，按入职时间排（老员工优先）
      return new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime();
    });

    // 3. 分桌
    const newTables: Table[] = [];
    let currentIndex = 0;
    
    const skipped = new Set(skippedNumbers.split(/[,，]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n)));
    const newCapacities = [...tableCapacities].filter(tc => !skipped.has(tc.tableNumber));
    
    for (let i = 0; i < newCapacities.length; i++) {
      const capacity = newCapacities[i].capacity;
      const tableNum = newCapacities[i].tableNumber;
      if (currentIndex >= sortedUsers.length) break;
      
      newTables.push({
        number: tableNum,
        members: sortedUsers.slice(currentIndex, currentIndex + capacity)
      });
      currentIndex += capacity;
    }
    
    const lastCapacity = newCapacities[newCapacities.length - 1]?.capacity || 10;
    let nextTableNum = newCapacities.reduce((max, tc) => Math.max(max, tc.tableNumber), 0) + 1;
    
    while (currentIndex < sortedUsers.length) {
      while (skipped.has(nextTableNum)) {
        nextTableNum++;
      }
      newCapacities.push({ id: Math.random().toString(36), tableNumber: nextTableNum, capacity: lastCapacity });
      
      newTables.push({
        number: nextTableNum,
        members: sortedUsers.slice(currentIndex, currentIndex + lastCapacity)
      });
      currentIndex += lastCapacity;
      nextTableNum++;
    }
    
    setTableCapacities(newCapacities);
    setTables(newTables);
  }, [activeUsers, departments, roles, selectedUserIds, skippedNumbers, tableCapacities]);

  const handleClear = useCallback(() => {
    setTables([]);
  }, []);

  const removeTable = useCallback((tableNumber: number) => {
    setTables(prev => prev.filter(t => t.number !== tableNumber));
  }, []);

  return {
    tableCapacities,
    tables,
    skippedNumbers,
    setSkippedNumbers,
    addTableCapacity,
    updateTableCapacity,
    removeTableCapacity,
    handleAutoArrange,
    handleClear,
    removeTable
  };
}
