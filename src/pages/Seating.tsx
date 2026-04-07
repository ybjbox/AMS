import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useUserStore } from '../store/users';
import { useDepartments, flattenDepartments } from '../store/departments';
import { Armchair, Users, ChevronRight, Printer, RefreshCw, Download, LayoutGrid, List, Trash2, Settings2, X, CheckSquare, Square, ExternalLink, Upload, FileDown, ChevronDown } from 'lucide-react';
import { BaseModal } from '../components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

interface Table {
  number: number;
  members: any[];
}

export default function Seating() {
  const users = useUserStore(state => state.users);
  const fetchUsers = useUserStore(state => state.fetchUsers);
  const departments = useDepartments(state => state.departments);
  const roles = useDepartments(state => state.roles);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const [tableCapacities, setTableCapacities] = useState<{id: string, tableNumber: number, capacity: number}[]>([{ id: Math.random().toString(36), tableNumber: 1, capacity: 10 }]);
  const [tables, setTables] = useState<Table[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [uploadedUsers, setUploadedUsers] = useState<any[] | null>(null);

  const activeUsers = useMemo(() => {
    if (uploadedUsers) return uploadedUsers;
    return users.filter(u => u.status !== '离职');
  }, [users, uploadedUsers]);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPrintWarningOpen, setIsPrintWarningOpen] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [skippedNumbers, setSkippedNumbers] = useState<string>('4,14,24');

  const [printSettings, setPrintSettings] = useState({
    cardStyle: 'style1', // 'style1' | 'style2'
    cardTitle: '聚会席位安排',
    footerText: '排名不分先后',
    themeColor: '#000000',
    cardWidth: 210, // mm (A4 width)
    cardHeight: 297, // mm (A4 height)
    titleFontSize: 24, // px
    numberFontSize: 48, // px
    contentFontSize: 30, // px
    titleFontFamily: '"Noto Serif SC", "SimSun", serif',
    numberFontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
    contentFontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
    footerFontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
    textAlign: 'center',
    showMembers: true,
    showIndex: true,
    showDepartment: true,
    showRole: true,
  });

  useEffect(() => {
    if (!uploadedUsers) {
      setSelectedUserIds(new Set(activeUsers.map(u => u.id)));
    }
  }, [activeUsers, uploadedUsers]);

  useEffect(() => {
    if (isParticipantModalOpen || isPrintModalOpen || isPrintWarningOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isParticipantModalOpen, isPrintModalOpen, isPrintWarningOpen]);

  const handleDownloadTemplate = useCallback(() => {
    alert('请求后端下载模板 (Mock)');
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock backend processing
    setTimeout(() => {
      const newUsers = [
        { id: `uploaded-${Date.now()}-1`, name: '张三', department: '技术部', role: '前端工程师', status: '在职' },
        { id: `uploaded-${Date.now()}-2`, name: '李四', department: '市场部', role: '市场总监', status: '在职' },
      ];
      setUploadedUsers(newUsers);
      setSelectedUserIds(new Set(newUsers.map(u => u.id)));
      alert('成功从后端获取到名单 (Mock)');
    }, 500);
    
    // Reset file input
    e.target.value = '';
  }, []);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, any[]> = {};
    activeUsers.forEach(u => {
      if (!groups[u.department]) groups[u.department] = [];
      groups[u.department].push(u);
    });
    return groups;
  }, [activeUsers]);

  const getTableDepartments = useCallback((members: any[]) => {
    const depts = new Set(members.map(m => m.department).filter(Boolean));
    return Array.from(depts).join('、');
  }, []);

  const renderJustifiedName = useCallback((name: string, fontSize: number) => {
    if (name.length <= 4) {
      return (
        <div 
          className="flex justify-between mx-auto" 
          style={{ width: `${fontSize * 4}px` }}
        >
          {name.split('').map((char, i) => (
            <span key={i}>{char}</span>
          ))}
        </div>
      );
    }
    return <div className="text-center">{name}</div>;
  }, []);

  const toggleUserSelection = useCallback((id: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const toggleDepartmentSelection = useCallback((dept: string, isSelected: boolean) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      groupedUsers[dept].forEach(u => {
        if (isSelected) newSet.add(u.id);
        else newSet.delete(u.id);
      });
      return newSet;
    });
  }, [groupedUsers]);

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

  const toggleDeptExpand = useCallback((dept: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDepts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dept)) newSet.delete(dept);
      else newSet.add(dept);
      return newSet;
    });
  }, []);

  const toggleAllDeptsExpand = useCallback(() => {
    setExpandedDepts(prev => {
      if (prev.size === Object.keys(groupedUsers).length) {
        return new Set();
      } else {
        return new Set(Object.keys(groupedUsers));
      }
    });
  }, [groupedUsers]);

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
      const aDeptPrio = deptPriorityMap[a.department] || 0;
      const bDeptPrio = deptPriorityMap[b.department] || 0;

      if (aDeptPrio !== bDeptPrio) {
        return bDeptPrio - aDeptPrio; // 部门优先级高的排前面
      }

      const aRolePrio = rolePriorityMap[a.role] || 0;
      const bRolePrio = rolePriorityMap[b.role] || 0;

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
    const newCapacities = tableCapacities.filter(tc => !skipped.has(tc.tableNumber));
    
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

  const handlePrint = useCallback(() => {
    try {
      if (window.self !== window.top) {
        setIsPrintWarningOpen(true);
      } else {
        window.print();
      }
    } catch (e) {
      setIsPrintWarningOpen(true);
    }
  }, []);

  const onRemoveTableCapacityClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const tcId = e.currentTarget.dataset.tcid;
    if (tcId) {
      removeTableCapacity(tcId);
    }
  }, [removeTableCapacity]);

  const onRemoveTableClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const tableNumberStr = e.currentTarget.dataset.tablenumber;
    if (tableNumberStr) {
      const tableNumber = parseInt(tableNumberStr, 10);
      setTables(prev => prev.filter(t => t.number !== tableNumber));
    }
  }, []);

  const onToggleDepartmentSelectionClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const dept = e.currentTarget.dataset.dept;
    const allSelectedStr = e.currentTarget.dataset.allselected;
    if (dept && allSelectedStr !== undefined) {
      const allSelected = allSelectedStr === 'true';
      toggleDepartmentSelection(dept, !allSelected);
    }
  }, [toggleDepartmentSelection]);

  const onToggleUserSelectionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const id = e.currentTarget.dataset.id;
    if (id) {
      toggleUserSelection(id);
    }
  }, [toggleUserSelection]);

  const onToggleDeptExpandClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const dept = e.currentTarget.dataset.dept;
    if (dept) {
      setExpandedDepts(prev => {
        const next = new Set(prev);
        if (next.has(dept)) {
          next.delete(dept);
        } else {
          next.add(dept);
        }
        return next;
      });
    }
  }, []);

  return (
    <>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">自动排座模块</h1>
          <p className="text-sm text-slate-500 mt-1">根据部门和职位优先级自动分配桌号，支持导出 A4 台卡</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="网格视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="列表视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {tables.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium shadow-sm"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              重置
            </button>
          )}
          {uploadedUsers && (
            <button
              onClick={() => setUploadedUsers(null)}
              className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-sm font-medium shadow-sm"
              title="清除上传的名单，恢复系统人员"
            >
              <X className="w-4 h-4 mr-2" />
              清除名单
            </button>
          )}
          <div className="relative" onMouseLeave={() => setIsUploadMenuOpen(false)}>
            <button
              onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
              className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              导入名单
              <ChevronDown className="w-4 h-4 ml-1" />
            </button>
            {isUploadMenuOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                <button
                  onClick={() => {
                    handleDownloadTemplate();
                    setIsUploadMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  下载模板
                </button>
                <label className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center cursor-pointer mb-0">
                  <Upload className="w-4 h-4 mr-2" />
                  上传文件
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    className="hidden" 
                    onChange={(e) => {
                      handleFileUpload(e);
                      setIsUploadMenuOpen(false);
                    }} 
                  />
                </label>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsParticipantModalOpen(true)}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Users className="w-4 h-4 mr-2" />
            选择人员 ({selectedUserIds.size})
          </button>
          <button
            onClick={() => setIsPrintModalOpen(true)}
            disabled={tables.length === 0}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
          >
            <Settings2 className="w-4 h-4 mr-2" />
            台卡设置
          </button>
          <button
            onClick={handlePrint}
            disabled={tables.length === 0}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
          >
            <Printer className="w-4 h-4 mr-2" />
            打印台卡
          </button>
          <button
            onClick={handleAutoArrange}
            className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform text-sm font-medium shadow-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            自动排座
          </button>
        </div>
      </div>

      {/* Configuration Card */}
      <div className="bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">各桌人数设置</label>
              <button onClick={addTableCapacity} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center">
                + 添加一桌
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {tableCapacities.map((tc) => (
                <div key={tc.id} className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 shadow-sm">
                  <span className="text-xs text-slate-500 dark:text-slate-400 px-2 font-medium whitespace-nowrap">{tc.tableNumber}号桌</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={tc.capacity}
                    onChange={(e) => updateTableCapacity(tc.id, parseInt(e.target.value) || 1)}
                    className="w-14 border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 rounded shadow-sm py-1 px-1 text-sm focus:ring-1 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 text-center text-slate-900 dark:text-white"
                  />
                  {tableCapacities.length > 1 && (
                    <button data-tcid={tc.id} onClick={onRemoveTableCapacityClick} className="ml-1 p-1 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center space-x-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">跳过桌号：</label>
              <input
                type="text"
                value={skippedNumbers}
                onChange={(e) => setSkippedNumbers(e.target.value)}
                placeholder="例如：4, 14, 24"
                className="flex-1 max-w-xs border border-zinc-200/80 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">（用逗号分隔，如：4, 14）</span>
            </div>
          </div>
          <div className="flex items-center space-x-8 md:px-6 md:border-l border-slate-100 dark:border-slate-700 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0">
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-1">参与人数</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{selectedUserIds.size}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-1">总座位数</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{tableCapacities.reduce((a, b) => a + b.capacity, 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {tables.length > 0 ? (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
          {tables.map((table) => (
            <div key={table.number} className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner dark:bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    {table.number}
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{table.number}号桌</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-600">
                    {table.members.length} 人
                  </span>
                  <button
                    data-tablenumber={table.number}
                    onClick={onRemoveTableClick}
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    title="删除此桌"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4 flex-1">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {table.members.map((m) => (
                      <div key={m.id} className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{m.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{m.department} · {m.role}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {table.members.map((m, idx) => (
                      <div key={m.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors group">
                        <div className="flex items-center space-x-3">
                          <span className="text-xs text-slate-400 dark:text-slate-500 w-4">{idx + 1}.</span>
                          <div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white">{m.name}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{m.department} · {m.role}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full mb-4">
            <Armchair className="w-12 h-12 text-blue-400 dark:text-blue-600" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white">准备好开始排座了吗？</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm text-center">
            点击右上角的“自动排座”按钮，系统将根据员工的部门和职位优先级为您生成最佳方案。
          </p>
        </div>
      )}
      </div>

      {/* Participant Selection Modal */}
      <BaseModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        title={
          <div className="flex items-center space-x-4">
            <span className="text-lg leading-6 font-medium text-slate-900 dark:text-white">选择参与人员</span>
            <button 
              onClick={toggleAllDeptsExpand}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              {expandedDepts.size === Object.keys(groupedUsers).length ? '全部收起' : '全部展开'}
            </button>
          </div>
        }
        size="2xl"
        bodyClassName="p-4 sm:p-6 max-h-[60vh] overflow-y-auto"
        footer={
          <button type="button" onClick={() => setIsParticipantModalOpen(false)} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm">完成</button>
        }
      >
        <div className="space-y-4 pr-2">
          {Object.entries(groupedUsers).map(([dept, deptUsers]: [string, any[]]) => {
            const allSelected = deptUsers.every(u => selectedUserIds.has(u.id));
            const someSelected = deptUsers.some(u => selectedUserIds.has(u.id)) && !allSelected;
            const isExpanded = expandedDepts.has(dept);
            return (
              <div key={dept} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div 
                  className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  data-dept={dept}
                  data-allselected={String(allSelected)}
                  onClick={onToggleDepartmentSelectionClick}
                >
                  <div className="flex items-center">
                    {allSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-600 mr-3" />
                    ) : someSelected ? (
                      <div className="w-5 h-5 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner dark:bg-blue-600 rounded flex items-center justify-center mr-3">
                        <div className="w-3 h-0.5 bg-white"></div>
                      </div>
                    ) : (
                      <Square className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3" />
                    )}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{dept}</span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({deptUsers.filter(u => selectedUserIds.has(u.id)).length}/{deptUsers.length})</span>
                  </div>
                  <button 
                    data-dept={dept}
                    onClick={onToggleDeptExpandClick}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    {deptUsers.map(u => (
                      <label key={u.id} className="flex items-center space-x-2 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          data-id={u.id}
                          checked={selectedUserIds.has(u.id)}
                          onChange={onToggleUserSelectionChange}
                          className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-slate-900"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{u.name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">({u.role})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </BaseModal>

      {/* Print Settings Modal */}
      <BaseModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="台卡打印设置"
        size="full"
        bodyClassName="p-0 overflow-hidden"
        footer={
          <>
            <button type="button" onClick={() => setIsPrintModalOpen(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm">取消</button>
            <button type="button" onClick={handlePrint} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm">直接打印</button>
          </>
        }
      >
        <div className="flex flex-col md:flex-row gap-8 flex-1 min-h-0 p-4 sm:p-6 w-full h-full overflow-hidden">
          {/* Settings Panel */}
          <div className="w-full md:w-[380px] shrink-0 overflow-y-auto pr-2 min-h-0 custom-scrollbar">
            <div className="space-y-3 pb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">台卡样式</label>
                <Select value={printSettings.cardStyle} onValueChange={(val) => {
                  setPrintSettings(prev => ({ 
                    ...prev, 
                    cardStyle: val,
                    contentFontSize: 30,
                    titleFontSize: val === 'style2' ? 30 : 24
                  }));
                }}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                    <SelectValue placeholder="选择样式">
                      {(val) => val === 'style1' ? '样式1 (经典双列)' : val === 'style2' ? '样式2 (极简单列)' : '选择样式'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="style1">样式1 (经典双列)</SelectItem>
                    <SelectItem value="style2">样式2 (极简单列)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {printSettings.cardStyle === 'style1' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">台卡标题</label>
                    <input 
                      type="text" 
                      value={printSettings.cardTitle}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, cardTitle: e.target.value }))}
                      className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">底部文字</label>
                    <input 
                      type="text" 
                      value={printSettings.footerText}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, footerText: e.target.value }))}
                      className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">主题颜色</label>
                <div className="flex items-center space-x-3">
                  <input 
                    type="color" 
                    value={printSettings.themeColor}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, themeColor: e.target.value }))}
                    className="h-9 w-14 rounded border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 cursor-pointer p-0.5" 
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400 uppercase">{printSettings.themeColor}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">宽度 (cm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={printSettings.cardWidth / 10}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, cardWidth: Math.round(parseFloat(e.target.value) * 10) || 210 }))}
                  className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">高度 (cm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={printSettings.cardHeight / 10}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, cardHeight: Math.round(parseFloat(e.target.value) * 10) || 297 }))}
                  className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                />
              </div>
            </div>
            <div className="text-xs text-blue-600 mt-1">默认使用A4纸的尺寸</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标题字号 (px)</label>
                <input 
                  type="number" 
                  value={printSettings.titleFontSize}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, titleFontSize: parseInt(e.target.value) || (prev.cardStyle === 'style2' ? 30 : 24) }))}
                  className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">桌号字号 (px)</label>
                <input 
                  type="number" 
                  value={printSettings.numberFontSize}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, numberFontSize: parseInt(e.target.value) || 48 }))}
                  className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标题字体</label>
                <Select value={printSettings.titleFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, titleFontFamily: val }))}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                    <SelectValue placeholder="选择字体">
                      {(val) => {
                        if (val === '"Noto Serif SC", "SimSun", serif') return '思源宋体 / 宋体';
                        if (val === '"Microsoft YaHei", "SimHei", sans-serif') return '微软雅黑 / 黑体';
                        if (val === '"KaiTi", "STKaiti", serif') return '楷体';
                        if (val === '"FangSong", "STFangsong", serif') return '仿宋';
                        return '选择字体';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                    <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                    <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                    <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">桌号字体</label>
                <Select value={printSettings.numberFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, numberFontFamily: val }))}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                    <SelectValue placeholder="选择字体">
                      {(val) => {
                        if (val === '"Noto Serif SC", "SimSun", serif') return '思源宋体 / 宋体';
                        if (val === '"Microsoft YaHei", "SimHei", sans-serif') return '微软雅黑 / 黑体';
                        if (val === '"KaiTi", "STKaiti", serif') return '楷体';
                        if (val === '"FangSong", "STFangsong", serif') return '仿宋';
                        return '选择字体';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                    <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                    <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                    <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">内容字体</label>
                <Select value={printSettings.contentFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, contentFontFamily: val }))}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                    <SelectValue placeholder="选择字体">
                      {(val) => {
                        if (val === '"Noto Serif SC", "SimSun", serif') return '思源宋体 / 宋体';
                        if (val === '"Microsoft YaHei", "SimHei", sans-serif') return '微软雅黑 / 黑体';
                        if (val === '"KaiTi", "STKaiti", serif') return '楷体';
                        if (val === '"FangSong", "STFangsong", serif') return '仿宋';
                        return '选择字体';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                    <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                    <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                    <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {printSettings.cardStyle === 'style1' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">底部字体</label>
                  <Select value={printSettings.footerFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, footerFontFamily: val }))}>
                    <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                      <SelectValue placeholder="选择字体">
                        {(val) => {
                          if (val === '"Noto Serif SC", "SimSun", serif') return '思源宋体 / 宋体';
                          if (val === '"Microsoft YaHei", "SimHei", sans-serif') return '微软雅黑 / 黑体';
                          if (val === '"KaiTi", "STKaiti", serif') return '楷体';
                          if (val === '"FangSong", "STFangsong", serif') return '仿宋';
                          return '选择字体';
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                      <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                      <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                      <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              {printSettings.cardStyle === 'style1' && (
                <>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={printSettings.showMembers}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, showMembers: e.target.checked }))}
                      className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">显示成员名单</span>
                  </label>
                  {printSettings.showMembers && (
                    <div className="pl-6 space-y-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={printSettings.showIndex}
                          onChange={(e) => setPrintSettings(prev => ({ ...prev, showIndex: e.target.checked }))}
                          className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">显示序号</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={printSettings.showDepartment}
                          onChange={(e) => setPrintSettings(prev => ({ ...prev, showDepartment: e.target.checked }))}
                          className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">显示部门</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={printSettings.showRole}
                          onChange={(e) => setPrintSettings(prev => ({ ...prev, showRole: e.target.checked }))}
                          className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">显示职位</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">内容字号 (px)</label>
                          <input 
                            type="number" 
                            value={printSettings.contentFontSize}
                            onChange={(e) => setPrintSettings(prev => ({ ...prev, contentFontSize: parseInt(e.target.value) || 30 }))}
                            className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">内容对齐</label>
                          <Select value={printSettings.textAlign} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, textAlign: val }))}>
                            <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                              <SelectValue placeholder="选择对齐方式">
                                {(val) => val === 'left' ? '居左' : val === 'center' ? '居中' : val === 'right' ? '居右' : '选择对齐方式'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">居左</SelectItem>
                              <SelectItem value="center">居中</SelectItem>
                              <SelectItem value="right">居右</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {printSettings.cardStyle === 'style2' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">内容字号 (px)</label>
                  <input 
                    type="number" 
                    value={printSettings.contentFontSize}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, contentFontSize: parseInt(e.target.value) || 30 }))}
                    className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                  />
                </div>
              )}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="flex-1 flex flex-col items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-6 overflow-y-auto relative min-h-[300px] md:min-h-0">
            <div className="sticky top-0 self-start text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-6 -ml-6 mb-4">打印预览 ({tables.length}桌)</div>
            
            <div className="flex flex-col gap-8 items-center w-full pt-2">
              {tables.map((table, tableIndex) => (
                <div key={table.number} className="flex flex-col items-center">
                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">第 {tableIndex + 1} 页</div>
                  {/* Scale wrapper to maintain layout space for scaled content */}
                  <div 
                    style={{ 
                      width: `${printSettings.cardWidth * 0.5}mm`, 
                      minHeight: `${printSettings.cardHeight * 0.5}mm` 
                    }}
                    className="flex-shrink-0 relative"
                  >
                    <div 
                      className="absolute top-0 left-0 flex flex-col bg-white box-border break-inside-avoid shadow-lg transition-all duration-300 origin-top-left"
                      style={{ 
                        width: `${printSettings.cardWidth}mm`, 
                        minHeight: `${printSettings.cardHeight}mm`,
                        border: printSettings.cardStyle === 'style1' ? `4px double ${printSettings.themeColor}` : 'none',
                        borderRadius: printSettings.cardStyle === 'style1' ? '20px' : '0',
                        padding: '20px',
                        transform: 'scale(0.5)'
                      }}
                    >
                    {printSettings.cardStyle === 'style1' ? (
                      <>
                        <div className="text-center border-b-2 pb-3 mb-3" style={{ borderColor: printSettings.themeColor }}>
                          <div 
                            className="mb-1"
                            style={{ 
                              color: printSettings.themeColor,
                              fontFamily: printSettings.titleFontFamily, 
                              fontSize: `${printSettings.titleFontSize}px`,
                              letterSpacing: '4px'
                            }}
                          >
                            {printSettings.cardTitle}
                          </div>
                          <div 
                            className="font-black"
                            style={{ color: printSettings.themeColor, fontSize: `${printSettings.numberFontSize}px`, fontFamily: printSettings.numberFontFamily }}
                          >
                            {table.number}号桌
                          </div>
                        </div>
                        
                        {printSettings.showMembers ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1" style={{ fontFamily: printSettings.contentFontFamily }}>
                            {table.members.map((m, idx) => (
                              <div key={m.id} className="flex items-center p-2 bg-slate-50 rounded-lg">
                                {printSettings.showIndex && (
                                  <div 
                                    className="font-bold text-slate-400 mr-3 flex-shrink-0 text-right"
                                    style={{ 
                                      fontSize: `${printSettings.contentFontSize * 1.2}px`,
                                      width: '1.5em'
                                    }}
                                  >
                                    {idx + 1}
                                  </div>
                                )}
                                <div className="flex-1 overflow-hidden" style={{ textAlign: printSettings.textAlign as any }}>
                                  <div 
                                    className="font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis"
                                    style={{ fontSize: `${printSettings.contentFontSize * 1.2}px` }}
                                  >
                                    {m.name}
                                  </div>
                                  {(printSettings.showDepartment || printSettings.showRole) && (
                                    <div 
                                      className="text-slate-500 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                                      style={{ fontSize: `${printSettings.contentFontSize}px` }}
                                    >
                                      {printSettings.showDepartment ? m.department : ''}
                                      {printSettings.showDepartment && printSettings.showRole ? ' · ' : ''}
                                      {printSettings.showRole ? m.role : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex-1"></div>
                        )}
                        
                        <div className="mt-3 text-center text-[10px] text-slate-400" style={{ fontFamily: printSettings.footerFontFamily }}>
                          {printSettings.footerText}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col h-full" style={{ color: printSettings.themeColor }}>
                        <div className="text-center mb-8">
                          <div className="flex items-baseline justify-center gap-2 mb-4">
                            <span 
                              className="font-black"
                              style={{ fontSize: `${printSettings.numberFontSize}px`, fontFamily: printSettings.numberFontFamily }}
                            >
                              {table.number} 号桌
                            </span>
                            <span 
                              className="font-medium"
                              style={{ fontSize: `${printSettings.titleFontSize}px`, fontFamily: printSettings.titleFontFamily }}
                            >
                              ({table.members.length}人)
                            </span>
                          </div>
                          <div 
                            className="font-medium"
                            style={{ fontSize: `${printSettings.titleFontSize * 0.8}px`, fontFamily: printSettings.titleFontFamily }}
                          >
                            ({getTableDepartments(table.members)})
                          </div>
                        </div>
                        
                        <div className="flex-1 flex flex-col items-center justify-start gap-4" style={{ fontFamily: printSettings.contentFontFamily }}>
                          {table.members.map(m => (
                            <div 
                              key={m.id} 
                              className="font-bold whitespace-nowrap"
                              style={{ fontSize: `${printSettings.contentFontSize * 1.5}px` }}
                            >
                              {renderJustifiedName(m.name, printSettings.contentFontSize * 1.5)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BaseModal>

      {/* Print Warning Modal */}
      <BaseModal
        isOpen={isPrintWarningOpen}
        onClose={() => setIsPrintWarningOpen(false)}
        title="打印功能受限"
        size="md"
        footer={
          <>
            <button 
              type="button" 
              onClick={() => setIsPrintWarningOpen(false)} 
              className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
            >
              我知道了
            </button>
            <button 
              type="button" 
              onClick={() => {
                setIsPrintWarningOpen(false);
                window.print(); // 尝试强制打印
              }} 
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
            >
              仍然尝试打印
            </button>
          </>
        }
      >
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 sm:mx-0 sm:h-10 sm:w-10">
            <Printer className="h-6 w-6 text-amber-600" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <div className="mt-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                由于您当前处于预览模式，浏览器的打印功能可能无法正常工作。
                <br /><br />
                请点击右上角的<strong className="text-slate-700 dark:text-slate-300">“在新标签页中打开”</strong>按钮，或者复制当前网址到新标签页中打开，然后再进行打印。
              </p>
            </div>
          </div>
        </div>
      </BaseModal>

      {/* Printable Area */}
      <div id="printable-area" className="hidden print:flex print:flex-wrap print:gap-[10mm] print:justify-center print:items-start print:p-[10mm] print:w-full print:bg-white">
        {tables.map(table => (
          <div 
            key={table.number} 
            className="relative flex flex-col bg-white box-border break-inside-avoid"
            style={{ 
              width: `${printSettings.cardWidth}mm`, 
              minHeight: `${printSettings.cardHeight}mm`,
              border: printSettings.cardStyle === 'style1' ? `4px double ${printSettings.themeColor}` : 'none',
              borderRadius: printSettings.cardStyle === 'style1' ? '20px' : '0',
              padding: '20px'
            }}
          >
            {printSettings.cardStyle === 'style1' ? (
              <>
                <div className="text-center border-b-2 pb-3 mb-3" style={{ borderColor: printSettings.themeColor }}>
                  <div 
                    className="mb-1"
                    style={{ 
                      color: printSettings.themeColor,
                      fontFamily: printSettings.titleFontFamily, 
                      fontSize: `${printSettings.titleFontSize}px`,
                      letterSpacing: '4px'
                    }}
                  >
                    {printSettings.cardTitle}
                  </div>
                  <div 
                    className="font-black"
                    style={{ color: printSettings.themeColor, fontSize: `${printSettings.numberFontSize}px`, fontFamily: printSettings.numberFontFamily }}
                  >
                    {table.number}号桌
                  </div>
                </div>
                
                {printSettings.showMembers ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1" style={{ fontFamily: printSettings.contentFontFamily }}>
                    {table.members.map((m, idx) => (
                      <div key={m.id} className="flex items-center p-2 bg-slate-50 rounded-lg">
                        {printSettings.showIndex && (
                          <div 
                            className="font-bold text-slate-400 mr-3 flex-shrink-0 text-right"
                            style={{ 
                              fontSize: `${printSettings.contentFontSize * 1.2}px`,
                              width: '1.5em'
                            }}
                          >
                            {idx + 1}
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden" style={{ textAlign: printSettings.textAlign as any }}>
                          <div 
                            className="font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis"
                            style={{ fontSize: `${printSettings.contentFontSize * 1.2}px` }}
                          >
                            {m.name}
                          </div>
                          {(printSettings.showDepartment || printSettings.showRole) && (
                            <div 
                              className="text-slate-500 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                              style={{ fontSize: `${printSettings.contentFontSize}px` }}
                            >
                              {printSettings.showDepartment ? m.department : ''}
                              {printSettings.showDepartment && printSettings.showRole ? ' · ' : ''}
                              {printSettings.showRole ? m.role : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1"></div>
                )}
                
                <div className="mt-3 text-center text-[10px] text-slate-400" style={{ fontFamily: printSettings.footerFontFamily }}>
                  {printSettings.footerText}
                </div>
              </>
            ) : (
              <div className="flex flex-col h-full" style={{ color: printSettings.themeColor }}>
                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center gap-2 mb-4">
                    <span 
                      className="font-black"
                      style={{ fontSize: `${printSettings.numberFontSize}px`, fontFamily: printSettings.numberFontFamily }}
                    >
                      {table.number} 号桌
                    </span>
                    <span 
                      className="font-medium"
                      style={{ fontSize: `${printSettings.titleFontSize}px`, fontFamily: printSettings.titleFontFamily }}
                    >
                      ({table.members.length}人)
                    </span>
                  </div>
                  <div 
                    className="font-medium"
                    style={{ fontSize: `${printSettings.titleFontSize * 0.8}px`, fontFamily: printSettings.titleFontFamily }}
                  >
                    ({getTableDepartments(table.members)})
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col items-center justify-start gap-4" style={{ fontFamily: printSettings.contentFontFamily }}>
                  {table.members.map(m => (
                    <div 
                      key={m.id} 
                      className="font-bold whitespace-nowrap"
                      style={{ fontSize: `${printSettings.contentFontSize * 1.5}px` }}
                    >
                      {renderJustifiedName(m.name, printSettings.contentFontSize * 1.5)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
