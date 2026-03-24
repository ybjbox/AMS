import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, MoreHorizontal, Edit, Trash2, ChevronLeft, ChevronRight, Filter, X, Check, Download, RefreshCw, GripVertical, FileCode, Printer, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { useDepartments, flattenDepartments, DepartmentNode, RoleNode } from '../store/departments';
import { useAuth } from '../store/auth';
import { useUserStore } from '../store/users';
import { Permission, SystemRole } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Item Component
interface SortableColumnProps {
  col: any;
  onToggle: () => void;
}

function SortableColumn({ col, onToggle }: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: col.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-3 rounded-xl border transition-all ${
        col.selected 
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 shadow-sm' 
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
      }`}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="mr-3 cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 dark:text-slate-500"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      
      <button
        onClick={onToggle}
        className="flex-1 flex items-center text-left"
      >
        <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-colors ${
          col.selected ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
        }`}>
          {col.selected && <Check className="h-3 w-3 text-white" />}
        </div>
        <span className="text-sm font-medium">{col.label}</span>
      </button>
    </div>
  );
}

// 辅助函数
const calculateAge = (idCard: string) => {
  if (!idCard || idCard.length !== 18) return '-';
  const year = parseInt(idCard.substring(6, 10));
  const month = parseInt(idCard.substring(10, 12));
  const day = parseInt(idCard.substring(12, 14));
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age;
};

const getGender = (idCard: string) => {
  if (!idCard || idCard.length !== 18) return '-';
  return parseInt(idCard.charAt(16)) % 2 === 0 ? '女' : '男';
};

const calculateYearsOfService = (joinDate: string) => {
  if (!joinDate) return '-';
  const join = new Date(joinDate);
  const today = new Date();
  let years = today.getFullYear() - join.getFullYear();
  let months = today.getMonth() - join.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < join.getDate())) {
    years--;
    months += 12;
  }
  return `${years}年${months}个月`;
};

const calculateDaysToExpiry = (expiryDate: string) => {
  if (!expiryDate) return '-';
  const expiry = new Date(expiryDate);
  const today = new Date();
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

function CustomCombobox({ 
  options, 
  defaultValue, 
  value: propValue,
  onChange: propOnChange,
  placeholder, 
  required 
}: { 
  options: string[], 
  defaultValue?: string, 
  value?: string,
  onChange?: (val: string) => void,
  placeholder?: string, 
  required?: boolean 
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const value = propValue !== undefined ? propValue : internalValue;
  
  const handleChange = (val: string) => {
    if (propValue === undefined) {
      setInternalValue(val);
    }
    if (propOnChange) {
      propOnChange(val);
    }
  };

  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative mt-1" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        className="block w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 pr-8 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
        placeholder={placeholder}
        required={required}
      />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 focus:outline-none"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 dark:ring-white/10 overflow-auto focus:outline-none sm:text-sm">
          {options.map((option) => (
            <div
              key={option}
              className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-900 dark:hover:text-white text-slate-900 dark:text-slate-200"
              onClick={() => {
                handleChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DepartmentTreeSelect({ 
  departments, 
  value, 
  onChange, 
  placeholder, 
  required 
}: { 
  departments: DepartmentNode[], 
  value: string, 
  onChange: (val: string) => void, 
  placeholder?: string, 
  required?: boolean 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const allIds = new Set<string>();
    const traverse = (nodes: DepartmentNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(departments);
    setExpandedNodes(allIds);
  };

  const collapseAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(new Set());
  };

  const isAllExpanded = () => {
    let totalNodes = 0;
    const traverse = (nodes: DepartmentNode[]) => {
      nodes.forEach(node => {
        totalNodes++;
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(departments);
    return expandedNodes.size === totalNodes && totalNodes > 0;
  };

  const renderTree = (nodes: DepartmentNode[], depth = 0) => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes.has(node.id);
      
      return (
        <div key={node.id}>
          <div 
            className="flex items-center py-2 px-3 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
            style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
            onClick={() => {
              onChange(node.name);
              setIsOpen(false);
            }}
          >
            <div 
              className="w-5 h-5 flex items-center justify-center mr-1"
              onClick={(e) => hasChildren ? toggleNode(e, node.id) : undefined}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" /> : <ChevronRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
              ) : <div className="w-4 h-4" />}
            </div>
            <span className={value === node.name ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}>{node.name}</span>
          </div>
          {hasChildren && isExpanded && (
            <div>
              {renderTree(node.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="relative mt-1" ref={wrapperRef}>
      <div 
        className="relative cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <input
          type="text"
          value={value}
          readOnly
          className="block w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 pr-8 focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          placeholder={placeholder}
          required={required}
        />
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400 dark:text-slate-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md ring-1 ring-black ring-opacity-5 dark:ring-white/10 flex flex-col focus:outline-none sm:text-sm">
          {departments.length > 0 ? (
            <>
              <div className="flex justify-end p-1 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-t-md shrink-0">
                <button
                  type="button"
                  onClick={isAllExpanded() ? collapseAll : expandAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {isAllExpanded() ? '一键收起' : '一键展开'}
                </button>
              </div>
              <div className="overflow-auto py-1">
                {renderTree(departments)}
              </div>
            </>
          ) : (
            <div className="py-2 px-3 text-sm text-slate-500 dark:text-slate-400">暂无部门数据</div>
          )}
        </div>
      )}
    </div>
  );
}

function RoleTreeSelect({ 
  departments, 
  roles,
  value, 
  onChange, 
  onDeptChange,
  placeholder, 
  required 
}: { 
  departments: DepartmentNode[], 
  roles: RoleNode[],
  value: string, 
  onChange: (val: string) => void, 
  onDeptChange?: (deptName: string) => void,
  placeholder?: string, 
  required?: boolean 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const allIds = new Set<string>();
    const traverse = (nodes: DepartmentNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(departments);
    setExpandedNodes(allIds);
  };

  const collapseAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(new Set());
  };

  const isAllExpanded = () => {
    let totalNodes = 0;
    const traverse = (nodes: DepartmentNode[]) => {
      nodes.forEach(node => {
        totalNodes++;
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(departments);
    return expandedNodes.size === totalNodes && totalNodes > 0;
  };

  const renderTree = (nodes: DepartmentNode[], depth = 0) => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const deptRoles = roles.filter(r => r.departmentId === node.id);
      const hasRoles = deptRoles.length > 0;
      const isExpanded = expandedNodes.has(node.id);
      
      return (
        <div key={node.id}>
          <div 
            className="flex items-center py-2 px-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
            style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
            onClick={(e) => {
              if (hasChildren || hasRoles) {
                toggleNode(e, node.id);
              }
            }}
          >
            <div 
              className="w-5 h-5 flex items-center justify-center mr-1"
            >
              {(hasChildren || hasRoles) ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" /> : <ChevronRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
              ) : <div className="w-4 h-4" />}
            </div>
            <span className="font-medium">{node.name}</span>
          </div>
          
          {isExpanded && (
            <div>
              {/* Render roles for this department */}
              {hasRoles && deptRoles.map(role => (
                <div 
                  key={`role-${role.id}`}
                  className="flex items-center py-2 px-3 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                  style={{ paddingLeft: `${(depth + 1) * 1.5 + 0.75}rem` }}
                  onClick={() => {
                    onChange(role.name);
                    if (onDeptChange) {
                      onDeptChange(node.name);
                    }
                    setIsOpen(false);
                  }}
                >
                  <div className="w-5 h-5 flex items-center justify-center mr-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-500" />
                  </div>
                  <span className={value === role.name ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}>{role.name}</span>
                </div>
              ))}
              
              {/* Render child departments */}
              {hasChildren && renderTree(node.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="relative mt-1" ref={wrapperRef}>
      <div 
        className="relative cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <input
          type="text"
          value={value}
          readOnly
          className="block w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 pr-8 focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          placeholder={placeholder}
          required={required}
        />
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400 dark:text-slate-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md ring-1 ring-black ring-opacity-5 dark:ring-white/10 flex flex-col focus:outline-none sm:text-sm">
          {departments.length > 0 ? (
            <>
              <div className="flex justify-end p-1 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-t-md shrink-0">
                <button
                  type="button"
                  onClick={isAllExpanded() ? collapseAll : expandAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {isAllExpanded() ? '一键收起' : '一键展开'}
                </button>
              </div>
              <div className="overflow-auto py-1">
                {renderTree(departments)}
              </div>
            </>
          ) : (
            <div className="py-2 px-3 text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
          )}
        </div>
      )}
    </div>
  );
}

function DepartmentTreeFilter({ 
  departments, 
  selectedDepartments, 
  onToggle 
}: { 
  departments: DepartmentNode[], 
  selectedDepartments: string[], 
  onToggle: (val: string) => void 
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const traverse = (nodes: DepartmentNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(departments);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const isAllExpanded = () => {
    let totalNodes = 0;
    const traverse = (nodes: DepartmentNode[]) => {
      nodes.forEach(node => {
        totalNodes++;
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(departments);
    return expandedNodes.size === totalNodes && totalNodes > 0;
  };

  const renderTree = (nodes: DepartmentNode[], depth = 0) => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes.has(node.id);
      const isSelected = selectedDepartments.includes(node.name);
      
      return (
        <div key={node.id}>
          <div 
            className="flex items-center py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm"
            style={{ paddingLeft: `${depth * 1.2}rem` }}
            onClick={() => onToggle(node.name)}
          >
            <div 
              className="w-5 h-5 flex items-center justify-center mr-1"
              onClick={(e) => hasChildren ? toggleNode(e, node.id) : undefined}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" /> : <ChevronRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
              ) : <div className="w-4 h-4" />}
            </div>
            <div className={`flex items-center space-x-2 ${isSelected ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <span>{node.name}</span>
            </div>
          </div>
          {hasChildren && isExpanded && (
            <div>
              {renderTree(node.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-md">
      <div className="flex justify-end p-1 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-t-md">
        <button
          onClick={isAllExpanded() ? collapseAll : expandAll}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
        >
          {isAllExpanded() ? '一键收起' : '一键展开'}
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto p-2">
        {departments.length > 0 ? renderTree(departments) : (
          <div className="py-2 px-3 text-sm text-slate-500 dark:text-slate-400">暂无部门数据</div>
        )}
      </div>
    </div>
  );
}

// 模拟员工数据

export default function Users() {
  const { hasPermission } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useUserStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddressBookModalOpen, setIsAddressBookModalOpen] = useState(false);
  const [themes, setThemes] = useState<any>({});
  const [scripts, setScripts] = useState<any[]>([]);
  const [exportConfig, setExportConfig] = useState(() => {
    const savedTitle = localStorage.getItem('rosterExportTitle');
    return {
      title: savedTitle || '员工信息表',
      includeResigned: true,
      themeId: 'default',
      mode: 'theme' as 'theme' | 'script',
      templateName: '',
      paperSize: 'A4',
      orientation: 'landscape',
      isDoubleSided: true,
      columns: [
        { key: 'id', label: '工号', selected: true },
        { key: 'name', label: '姓名', selected: true },
        { key: 'department', label: '部门', selected: true },
        { key: 'role', label: '职位', selected: true },
        { key: 'status', label: '状态', selected: true },
        { key: 'phone', label: '联系电话', selected: true },
        { key: 'gender', label: '性别', selected: false },
        { key: 'age', label: '年龄', selected: false },
        { key: 'joinDate', label: '入职时间', selected: true },
        { key: 'yearsOfService', label: '工龄', selected: false },
        { key: 'employmentType', label: '用工形式', selected: false },
        { key: 'contractExpiry', label: '合同到期', selected: true },
      ]
    };
  });
  const [addressBookConfig, setAddressBookConfig] = useState(() => {
    const savedTitle = localStorage.getItem('addressBookExportTitle');
    return {
      title: savedTitle || '公司通讯录',
      includeResigned: false,
      paperSize: 'A4',
      orientation: 'portrait',
      isDoubleSided: true,
      isTwoColumn: false,
      mergeDepartments: false,
      columns: [
        { key: 'name', label: '姓名', selected: true },
        { key: 'department', label: '部门', selected: true },
        { key: 'role', label: '职位', selected: true },
        { key: 'phone', label: '联系电话', selected: true },
        { key: 'id', label: '工号', selected: false },
        { key: 'gender', label: '性别', selected: false },
        { key: 'status', label: '状态', selected: false },
      ]
    };
  });

  useEffect(() => {
    localStorage.setItem('rosterExportTitle', exportConfig.title);
  }, [exportConfig.title]);

  useEffect(() => {
    localStorage.setItem('addressBookExportTitle', addressBookConfig.title);
  }, [addressBookConfig.title]);

  useEffect(() => {
    if (isModalOpen || isDetailModalOpen || isExportModalOpen || isAddressBookModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isDetailModalOpen, isExportModalOpen, isAddressBookModalOpen]);
  const addressBookPrintRef = useRef<HTMLDivElement>(null);
  const rosterPrintRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const processedAddressBookUsers = useMemo(() => {
    let processed = users.filter(u => addressBookConfig.includeResigned ? true : u.status !== '离职');
    if (addressBookConfig.mergeDepartments) {
      processed = [...processed].sort((a, b) => (a.department || '').localeCompare(b.department || ''));
    }
    return processed;
  }, [users, addressBookConfig.includeResigned, addressBookConfig.mergeDepartments]);

  const calculateRowSpans = (usersList: any[], config: any) => {
    if (!config.mergeDepartments) return usersList.map(u => ({ ...u, _deptSpan: 1 }));
    
    const result = [];
    let currentDept = null;
    let currentSpanIndex = -1;
    let deptCount = 0;
    
    for (let i = 0; i < usersList.length; i++) {
      const user = usersList[i];
      if (user.department !== currentDept) {
        currentDept = user.department;
        currentSpanIndex = i;
        deptCount = 1;
        result.push({ ...user, _deptSpan: 1, _deptCount: 1 });
      } else {
        deptCount++;
        result[currentSpanIndex]._deptSpan = deptCount;
        result[currentSpanIndex]._deptCount = deptCount;
        result.push({ ...user, _deptSpan: 0 });
      }
    }
    return result;
  };

  const { leftUsers, rightUsers } = useMemo(() => {
    if (addressBookConfig.isTwoColumn) {
      const mid = Math.ceil(processedAddressBookUsers.length / 2);
      return {
        leftUsers: calculateRowSpans(processedAddressBookUsers.slice(0, mid), addressBookConfig),
        rightUsers: calculateRowSpans(processedAddressBookUsers.slice(mid), addressBookConfig)
      };
    } else {
      return {
        leftUsers: calculateRowSpans(processedAddressBookUsers, addressBookConfig),
        rightUsers: []
      };
    }
  }, [processedAddressBookUsers, addressBookConfig.isTwoColumn, addressBookConfig.mergeDepartments]);

  const { previewLeft, previewRight } = useMemo(() => {
    const previewUsers = processedAddressBookUsers.slice(0, 20);
    if (addressBookConfig.isTwoColumn) {
      const mid = Math.ceil(previewUsers.length / 2);
      return {
        previewLeft: calculateRowSpans(previewUsers.slice(0, mid), addressBookConfig),
        previewRight: calculateRowSpans(previewUsers.slice(mid), addressBookConfig)
      };
    } else {
      return {
        previewLeft: calculateRowSpans(previewUsers, addressBookConfig),
        previewRight: []
      };
    }
  }, [processedAddressBookUsers, addressBookConfig.isTwoColumn, addressBookConfig.mergeDepartments]);

  const renderTableContent = (usersData: any[], config: any) => {
    const selectedCols = config.columns.filter((c: any) => c.selected);
    return (
      <table className="w-full border-collapse text-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {selectedCols.map((col: any) => (
              <th key={col.key} className="border border-slate-300 px-3 py-2 bg-slate-50 text-center font-semibold text-slate-700">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usersData.map((user, idx) => (
            <tr key={user.id || idx}>
              {selectedCols.map((col: any) => {
                if (col.key === 'department' && config.mergeDepartments) {
                  if (user._deptSpan === 0) return null;
                  return (
                    <td key={col.key} rowSpan={user._deptSpan} className="border border-slate-300 px-3 py-2 text-slate-600 text-center align-middle font-medium bg-slate-50/50" style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                      {user[col.key] || '-'}
                      <div className="text-xs text-slate-400 mt-0.5" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>({user._deptCount}人)</div>
                    </td>
                  );
                }
                return (
                  <td key={col.key} className="border border-slate-300 px-3 py-2 text-slate-600 text-center" style={{ textAlign: 'center' }}>
                    {user[col.key] || '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setExportConfig((prev) => {
        const oldIndex = prev.columns.findIndex((col) => col.key === active.id);
        const newIndex = prev.columns.findIndex((col) => col.key === over.id);

        return {
          ...prev,
          columns: arrayMove(prev.columns, oldIndex, newIndex),
        };
      });
    }
  };

  const handleAddressBookDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setAddressBookConfig((prev) => {
        const oldIndex = prev.columns.findIndex((col) => col.key === active.id);
        const newIndex = prev.columns.findIndex((col) => col.key === over.id);

        return {
          ...prev,
          columns: arrayMove(prev.columns, oldIndex, newIndex),
        };
      });
    }
  };

  const handlePrintRoster = () => {
    if (!rosterPrintRef.current) return;
    
    const printContent = rosterPrintRef.current.innerHTML;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const printDocument = iframe.contentWindow?.document;
    if (printDocument) {
      printDocument.write(`
        <html>
          <head>
            <title>${exportConfig.title}</title>
            <style>
              @page {
                size: ${exportConfig.paperSize} ${exportConfig.orientation};
                margin: 10mm;
              }
              ${exportConfig.isDoubleSided ? `
              @page :left {
                margin-left: 15mm;
                margin-right: 10mm;
              }
              @page :right {
                margin-left: 10mm;
                margin-right: 15mm;
              }
              ` : ''}
              body {
                font-family: 'SimSun', 'Songti SC', serif;
                font-size: 10pt;
                color: #000;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                font-size: 9pt;
              }
              th, td {
                border: 1px solid #000;
                padding: 4px 6px;
                text-align: left;
                word-break: break-all;
              }
              th {
                background-color: #f0f0f0 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                font-weight: bold;
              }
              h1 {
                text-align: center;
                font-size: 16pt;
                margin-bottom: 10px;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);
      printDocument.close();
      
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsExportModalOpen(false);
        }, 1000);
      }, 250);
    }
  };

  const handlePrintAddressBook = () => {
    if (!addressBookPrintRef.current) return;
    
    const printContent = addressBookPrintRef.current.innerHTML;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const printDocument = iframe.contentWindow?.document;
    if (printDocument) {
      printDocument.write(`
        <html>
          <head>
            <title>${addressBookConfig.title}</title>
            <style>
              @page {
                size: ${addressBookConfig.paperSize} ${addressBookConfig.orientation};
                margin: 10mm;
              }
              ${addressBookConfig.isDoubleSided ? `
              @page :left {
                margin-left: 15mm;
                margin-right: 10mm;
              }
              @page :right {
                margin-left: 10mm;
                margin-right: 15mm;
              }
              ` : ''}
              body {
                font-family: 'SimSun', 'Songti SC', serif;
                font-size: 10pt;
                color: #000;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                font-size: 9pt;
              }
              th, td {
                border: 1px solid #000;
                padding: 4px 6px;
                text-align: left;
                word-break: break-all;
              }
              th {
                background-color: #f0f0f0 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                font-weight: bold;
              }
              h1 {
                text-align: center;
                font-size: 16pt;
                margin-bottom: 10px;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);
      printDocument.close();
      
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsAddressBookModalOpen(false);
        }, 1000);
      }, 250);
    }
  };

  // Fetch themes and scripts when export modal opens
  useEffect(() => {
    if (isExportModalOpen) {
      // Mock backend processing
      setTimeout(() => {
        setThemes({
          'theme_1': {
            id: 'theme_1',
            name: '默认主题',
            titleFill: 'FFF1F5F9',
            headerFill: 'FF2563EB',
            headerFontColor: 'FFFFFFFF',
            zebraFill: 'FFF8FAFC',
          }
        });
      }, 500);

      setTimeout(() => {
        const mockScripts = [
          { name: 'default_template', code: '// 默认导出模板' },
          { name: 'custom_template', code: '// 自定义导出模板' }
        ];
        setScripts(mockScripts);
        if (mockScripts.length > 0 && !exportConfig.templateName) {
          setExportConfig(prev => ({ ...prev, templateName: mockScripts[0].name }));
        }
      }, 500);
    }
  }, [isExportModalOpen]);

  // 防止弹窗打开时底层页面滚动
  useEffect(() => {
    if (isModalOpen || isExportModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isExportModalOpen]);

  const [selectedDeptName, setSelectedDeptName] = useState<string>('');
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  const { departments, roles } = useDepartments();
  const flatDepts = useMemo(() => flattenDepartments(departments), [departments]);
  
  // 筛选状态
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<{ department: string[], status: string[] }>({
    department: [],
    status: []
  });

  const itemsPerPage = 10;

  // 过滤数据逻辑
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // 1. 搜索词匹配
      const matchesSearch = 
        (user.name || '').includes(searchTerm) || 
        (user.id || '').includes(searchTerm) ||
        (user.department || '').includes(searchTerm);
      
      // 2. 部门筛选匹配
      const matchesDept = filters.department.length > 0 ? filters.department.includes(user.department || '') : true;
      
      // 3. 状态筛选匹配
      const matchesStatus = filters.status.length > 0 ? filters.status.includes(user.status || '') : true;

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [searchTerm, filters, users]);

  // 分页数据
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const currentUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const handleAdd = () => {
    setEditingUser(null);
    setSelectedDeptName('');
    setSelectedRoleName('');
    setIsModalOpen(true);
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setSelectedDeptName(user.department || '');
    setSelectedRoleName(user.role || '');
    setIsModalOpen(true);
  };

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => {
      const currentValues = prev[key] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      return { ...prev, [key]: newValues };
    });
    setCurrentPage(1); // 重置页码
  };

  const clearFilters = () => {
    setFilters({ department: [], status: [] });
    setCurrentPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Mock backend processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert(`成功导出 ${filteredUsers.length} 条员工数据 (Mock)`);
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  const activeFilterCount = filters.department.length + filters.status.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">员工管理</h1>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsAddressBookModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Printer className="h-4 w-4 mr-2" />
            导出通讯录
          </button>
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            导出花名册
          </button>
          {hasPermission(Permission.MANAGE_USERS) && (
            <button 
              onClick={handleAdd}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              新增员工
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50 rounded-t-xl">
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="搜索姓名、工号或部门..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // 重置页码
              }}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <div className="flex items-center space-x-2 relative">
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`inline-flex items-center px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                activeFilterCount > 0 || isFilterOpen
                  ? 'border-blue-500 dark:border-blue-400 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              <Filter className={`h-4 w-4 mr-2 ${activeFilterCount > 0 || isFilterOpen ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
              筛选 {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>

            {/* Filter Dropdown */}
            {isFilterOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsFilterOpen(false)}
                />
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
                    {/* 部门筛选 */}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">所属部门</label>
                      <DepartmentTreeFilter 
                        departments={departments}
                        selectedDepartments={filters.department || []}
                        onToggle={(deptName) => handleFilterChange('department', deptName)}
                      />
                    </div>
                    
                    {/* 状态筛选 */}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">员工状态</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFilterChange('status', '在职')}
                          className={`flex-1 flex items-center justify-center px-2 py-2 rounded-md text-xs font-medium transition-colors border whitespace-nowrap ${
                            (filters.status || []).includes('在职')
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                          }`}
                        >
                          {(filters.status || []).includes('在职') && <Check className="h-3 w-3 mr-1 shrink-0" />}
                          在职
                        </button>
                        <button
                          onClick={() => handleFilterChange('status', '试用期')}
                          className={`flex-1 flex items-center justify-center px-2 py-2 rounded-md text-xs font-medium transition-colors border whitespace-nowrap ${
                            (filters.status || []).includes('试用期')
                              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                          }`}
                        >
                          {(filters.status || []).includes('试用期') && <Check className="h-3 w-3 mr-1 shrink-0" />}
                          试用期
                        </button>
                        <button
                          onClick={() => handleFilterChange('status', '离职')}
                          className={`flex-1 flex items-center justify-center px-2 py-2 rounded-md text-xs font-medium transition-colors border whitespace-nowrap ${
                            (filters.status || []).includes('离职')
                              ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                          }`}
                        >
                          {(filters.status || []).includes('离职') && <Check className="h-3 w-3 mr-1 shrink-0" />}
                          离职
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">工号</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">姓名</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">部门 / 职位</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">系统角色</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">状态</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">联系电话</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">性别/年龄</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">入职时间/工龄</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">用工形式</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">合同到期(天)</th>
                <th scope="col" className="relative px-6 py-3 whitespace-nowrap">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {currentUsers.length > 0 ? (
                currentUsers.map((user) => (
                  <tr 
                    key={user.id} 
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedUser(user);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">{user.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium text-xs mr-3">
                          {user.name.charAt(0)}
                        </div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{user.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 dark:text-white">{user.department}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{user.role}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.systemRole === SystemRole.SUPER_ADMIN ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' :
                        user.systemRole === SystemRole.ADMIN ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' :
                        user.systemRole === SystemRole.HR ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' :
                        'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
                      }`}>
                        {user.systemRole === SystemRole.SUPER_ADMIN ? '超级管理员' : 
                         user.systemRole === SystemRole.ADMIN ? '管理员' : 
                         user.systemRole === SystemRole.HR ? '人事主管' : '普通员工'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        user.status === '在职' || user.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                        : user.status === '试用期' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                        : user.status === '离职' || user.status === 'inactive' ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                        : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                      }`}>
                        {user.status === 'active' ? '在职' : user.status === 'inactive' ? '离职' : user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{user.phone}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{user.gender} / {user.age}岁</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 dark:text-white">{user.joinDate}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{user.yearsOfService}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{user.employmentType}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 dark:text-white">{user.contractExpiry}</div>
                      <div className={`text-xs font-medium ${user.daysToExpiry < 30 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {user.daysToExpiry > 0 ? `剩 ${user.daysToExpiry} 天` : '已过期'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {hasPermission(Permission.MANAGE_USERS) && (
                          <>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(user);
                              }} 
                              className="p-1 text-slate-400 hover:text-blue-600 transition-colors" 
                              title="编辑"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Add delete logic here if needed
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors" 
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            // Add more logic here if needed
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 transition-colors" 
                          title="更多"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                    没有找到匹配的员工数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 rounded-b-xl">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                显示第 <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> 到 <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> 条，
                共 <span className="font-medium">{filteredUsers.length}</span> 条记录
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">上一页</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                
                {/* 简化的页码显示 */}
                <span className="relative inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {currentPage} / {totalPages || 1}
                </span>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">下一页</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </div>
          
          {/* Mobile pagination */}
          <div className="flex items-center justify-between w-full sm:hidden">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="relative inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* Export Configuration Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onClick={() => setIsExportModalOpen(false)}></div>
            
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full sm:w-[95vw] sm:max-w-[1600px] h-[95vh] sm:h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">导出配置</h3>
                <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                <div className="w-full md:w-1/3 p-6 space-y-6 overflow-y-auto border-r border-slate-100 dark:border-slate-700 custom-scrollbar h-full">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">表格大标题</label>
                    <input 
                      type="text" 
                      value={exportConfig.title}
                      onChange={(e) => setExportConfig(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      placeholder="请输入表格标题"
                    />
                  </div>

                  {/* Business Logic */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={exportConfig.includeResigned}
                            onChange={(e) => setExportConfig(prev => ({ ...prev, includeResigned: e.target.checked }))}
                          />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${exportConfig.includeResigned ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                          <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${exportConfig.includeResigned ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">包含离职人员</span>
                      </label>
                    </div>
                  </div>

                  {/* Print Settings */}
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">打印设置</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">纸张大小</label>
                        <select
                          value={exportConfig.paperSize}
                          onChange={(e) => setExportConfig(prev => ({ ...prev, paperSize: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="A4">A4</option>
                          <option value="A3">A3</option>
                          <option value="Letter">Letter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">纸张方向</label>
                        <select
                          value={exportConfig.orientation}
                          onChange={(e) => setExportConfig(prev => ({ ...prev, orientation: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="portrait">纵向</option>
                          <option value="landscape">横向</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={exportConfig.isDoubleSided}
                            onChange={(e) => setExportConfig(prev => ({ ...prev, isDoubleSided: e.target.checked }))}
                          />
                          <div className={`block w-8 h-5 rounded-full transition-colors ${exportConfig.isDoubleSided ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                          <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${exportConfig.isDoubleSided ? 'translate-x-3' : ''}`}></div>
                        </div>
                        <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">双面打印 (预留装订边距)</span>
                      </label>
                    </div>
                  </div>

                  {/* Mode Selection */}
                  <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
                    <button
                      onClick={() => setExportConfig(prev => ({ ...prev, mode: 'theme' }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        exportConfig.mode === 'theme' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      配色主题模式
                    </button>
                    <button
                      onClick={() => setExportConfig(prev => ({ ...prev, mode: 'script' }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        exportConfig.mode === 'script' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      JS 脚本模式
                    </button>
                  </div>

                  {/* Theme Selection */}
                  {exportConfig.mode === 'theme' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">选择表格主题</label>
                      <div className="grid grid-cols-4 gap-3">
                        {Object.values(themes).map((theme: any) => (
                          <button
                            key={theme.id}
                            onClick={() => setExportConfig(prev => ({ ...prev, themeId: theme.id }))}
                            className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
                              exportConfig.themeId === theme.id 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20' 
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <div 
                              className="w-full h-8 rounded-lg mb-2" 
                              style={{ backgroundColor: `#${theme.headerFill.substring(2)}` }}
                            ></div>
                            <span className={`text-[10px] font-medium truncate w-full text-center ${exportConfig.themeId === theme.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>
                              {theme.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">选择脚本模板</label>
                      <div className="space-y-2">
                        {scripts.map((script) => (
                          <button
                            key={script.name}
                            onClick={() => setExportConfig(prev => ({ ...prev, templateName: script.name }))}
                            className={`w-full flex items-center p-3 rounded-xl border transition-all ${
                              exportConfig.templateName === script.name 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20' 
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg mr-3">
                              <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="text-left">
                              <div className={`text-sm font-semibold ${exportConfig.templateName === script.name ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                                {script.name}.js
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                                {script.code.substring(0, 50)}...
                              </div>
                            </div>
                            {exportConfig.templateName === script.name && (
                              <div className="ml-auto w-2 h-2 bg-blue-600 rounded-full"></div>
                            )}
                          </button>
                        ))}
                        {scripts.length === 0 && (
                          <div className="py-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            <p className="text-xs text-slate-500 dark:text-slate-400">暂无脚本，请前往系统设置创建</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Columns Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">选择并排序导出列</label>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">拖拽左侧图标进行排序</span>
                    </div>
                    
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={exportConfig.columns.map(c => c.key)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {exportConfig.columns.map((col, idx) => {
                            const SortableColumnAny = SortableColumn as any;
                            return (
                              <SortableColumnAny 
                                key={col.key} 
                                col={col} 
                                onToggle={() => {
                                  const newCols = [...exportConfig.columns];
                                  newCols[idx].selected = !newCols[idx].selected;
                                  setExportConfig(prev => ({ ...prev, columns: newCols }));
                                }}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>

                <div className="w-full md:w-2/3 flex flex-col items-center bg-slate-100 dark:bg-slate-900 p-6 overflow-auto relative min-h-[400px] h-full custom-scrollbar">
                  <div className="sticky top-0 self-start text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-6 -ml-6 mb-4">打印预览</div>
                  <div className="w-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 p-8">
                    <div className="text-center mb-6">
                      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{exportConfig.title}</h1>
                    </div>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          {exportConfig.columns.filter(c => c.selected).map(col => (
                            <th key={col.key} className="border border-slate-300 dark:border-slate-600 px-3 py-2 bg-slate-50 dark:bg-slate-700 text-left font-semibold text-slate-700 dark:text-slate-200">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {users
                          .filter(u => exportConfig.includeResigned ? true : u.status !== '离职')
                          .slice(0, 10)
                          .map(user => (
                            <tr key={user.id}>
                              {exportConfig.columns.filter(c => c.selected).map(col => (
                                <td key={col.key} className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-slate-600 dark:text-slate-300">
                                  {(user as any)[col.key] || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {users.filter(u => exportConfig.includeResigned ? true : u.status !== '离职').length > 10 && (
                      <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400">
                        ... 仅显示前 10 条预览数据，共 {users.filter(u => exportConfig.includeResigned ? true : u.status !== '离职').length} 条 ...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end space-x-3 shrink-0">
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                >
                  取消
                </button>
                <button 
                  onClick={handlePrintRoster}
                  disabled={exportConfig.columns.filter(c => c.selected).length === 0}
                  className="inline-flex items-center justify-center px-6 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-all shadow-sm disabled:opacity-50"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  打印
                </button>
                <button 
                  onClick={handleExport}
                  disabled={isExporting || exportConfig.columns.filter(c => c.selected).length === 0}
                  className="inline-flex items-center justify-center px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-200 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      导出中...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      确认导出
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Address Book Configuration Modal */}
      {isAddressBookModalOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onClick={() => setIsAddressBookModalOpen(false)}></div>
            
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full sm:w-[95vw] sm:max-w-[1600px] h-[95vh] sm:h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">导出通讯录</h3>
                <button onClick={() => setIsAddressBookModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                <div className="w-full md:w-1/3 p-6 space-y-6 overflow-y-auto border-r border-slate-100 dark:border-slate-700 custom-scrollbar h-full bg-white dark:bg-slate-800">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">通讯录大标题</label>
                    <input 
                      type="text" 
                      value={addressBookConfig.title}
                      onChange={(e) => setAddressBookConfig(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      placeholder="请输入通讯录标题"
                    />
                  </div>

                  {/* Business Logic */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={addressBookConfig.includeResigned}
                            onChange={(e) => setAddressBookConfig(prev => ({ ...prev, includeResigned: e.target.checked }))}
                          />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${addressBookConfig.includeResigned ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                          <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${addressBookConfig.includeResigned ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">包含离职人员</span>
                      </label>
                    </div>
                  </div>

                  {/* Print Settings */}
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">打印设置</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">纸张大小</label>
                        <select
                          value={addressBookConfig.paperSize}
                          onChange={(e) => setAddressBookConfig(prev => ({ ...prev, paperSize: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="A4">A4</option>
                          <option value="A3">A3</option>
                          <option value="Letter">Letter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">纸张方向</label>
                        <select
                          value={addressBookConfig.orientation}
                          onChange={(e) => setAddressBookConfig(prev => ({ ...prev, orientation: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="portrait">纵向</option>
                          <option value="landscape">横向</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={addressBookConfig.isDoubleSided}
                            onChange={(e) => setAddressBookConfig(prev => ({ ...prev, isDoubleSided: e.target.checked }))}
                          />
                          <div className={`block w-8 h-5 rounded-full transition-colors ${addressBookConfig.isDoubleSided ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                          <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${addressBookConfig.isDoubleSided ? 'translate-x-3' : ''}`}></div>
                        </div>
                        <span className="ml-2 text-sm text-slate-600">双面打印 (预留装订边距)</span>
                      </label>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={addressBookConfig.isTwoColumn}
                            onChange={(e) => setAddressBookConfig(prev => ({ ...prev, isTwoColumn: e.target.checked }))}
                          />
                          <div className={`block w-8 h-5 rounded-full transition-colors ${addressBookConfig.isTwoColumn ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                          <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${addressBookConfig.isTwoColumn ? 'translate-x-3' : ''}`}></div>
                        </div>
                        <span className="ml-2 text-sm text-slate-600">双栏排版 (适合字段较少)</span>
                      </label>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={addressBookConfig.mergeDepartments}
                            onChange={(e) => setAddressBookConfig(prev => ({ ...prev, mergeDepartments: e.target.checked }))}
                          />
                          <div className={`block w-8 h-5 rounded-full transition-colors ${addressBookConfig.mergeDepartments ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
                          <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform ${addressBookConfig.mergeDepartments ? 'translate-x-3' : ''}`}></div>
                        </div>
                        <span className="ml-2 text-sm text-slate-600">按部门合并并统计人数</span>
                      </label>
                    </div>
                  </div>

                  {/* Columns Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-slate-700">选择并排序导出列</label>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">拖拽左侧图标进行排序</span>
                    </div>
                    
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleAddressBookDragEnd}
                    >
                      <SortableContext 
                        items={addressBookConfig.columns.map(c => c.key)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {addressBookConfig.columns.map((col, idx) => {
                            const SortableColumnAny = SortableColumn as any;
                            return (
                              <SortableColumnAny 
                                key={col.key} 
                                col={col} 
                                onToggle={() => {
                                  const newCols = [...addressBookConfig.columns];
                                  newCols[idx].selected = !newCols[idx].selected;
                                  setAddressBookConfig(prev => ({ ...prev, columns: newCols }));
                                }}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>

                <div className="w-full md:w-2/3 flex flex-col items-center bg-slate-100 p-6 overflow-auto relative min-h-[400px] h-full custom-scrollbar">
                  <div className="sticky top-0 self-start text-xs font-medium text-slate-500 uppercase tracking-wider z-10 bg-white/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-6 -ml-6 mb-4">打印预览</div>
                  <div className="w-full bg-white shadow-sm border border-slate-200 p-8">
                    <div className="text-center mb-6">
                      <h1 className="text-2xl font-bold text-slate-900">{addressBookConfig.title}</h1>
                    </div>
                    <div className={`flex ${addressBookConfig.isTwoColumn ? 'gap-6' : ''} items-start`}>
                      <div className="flex-1">
                        {renderTableContent(previewLeft, addressBookConfig)}
                      </div>
                      {addressBookConfig.isTwoColumn && (
                        <div className="flex-1">
                          {renderTableContent(previewRight, addressBookConfig)}
                        </div>
                      )}
                    </div>
                    {processedAddressBookUsers.length > 20 && (
                      <div className="text-center py-4 text-sm text-slate-500">
                        ... 仅显示前 20 条预览数据，共 {processedAddressBookUsers.length} 条 ...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3 shrink-0">
                <button 
                  onClick={() => setIsAddressBookModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  取消
                </button>
                <button 
                  onClick={handlePrintAddressBook}
                  disabled={addressBookConfig.columns.filter(c => c.selected).length === 0}
                  className="inline-flex items-center justify-center px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-200 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  打印通讯录
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Printable Area for Roster */}
      <div className="hidden">
        <div ref={rosterPrintRef}>
          <h1>{exportConfig.title}</h1>
          <table>
            <thead>
              <tr>
                {exportConfig.columns.filter(c => c.selected).map(col => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users
                .filter(u => exportConfig.includeResigned ? true : u.status !== '离职')
                .map(user => (
                  <tr key={user.id}>
                    {exportConfig.columns.filter(c => c.selected).map(col => (
                      <td key={col.key}>{(user as any)[col.key] || '-'}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden Printable Area for Address Book */}
      <div className="hidden">
        <div ref={addressBookPrintRef}>
          <h1>{addressBookConfig.title}</h1>
          <div style={{ display: addressBookConfig.isTwoColumn ? 'flex' : 'block', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {renderTableContent(leftUsers, addressBookConfig)}
            </div>
            {addressBookConfig.isTwoColumn && (
              <div style={{ flex: 1 }}>
                {renderTableContent(rightUsers, addressBookConfig)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Employee Detail Modal */}
      {isDetailModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="detail-modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
              aria-hidden="true"
              onClick={() => setIsDetailModalOpen(false)}
            ></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="relative z-10 inline-block align-bottom w-full bg-white dark:bg-slate-800 rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-slate-200 dark:border-slate-700">
              <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center" id="detail-modal-title">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mr-4">
                    {selectedUser.name.charAt(0)}
                  </div>
                  员工详细信息
                </h3>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-6 py-6" id="printable-contact-card">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">基本信息</h4>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">姓名</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">工号</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">性别</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.gender}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">年龄</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.age}岁</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">联系电话</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">工作信息</h4>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">部门</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.department}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">职位</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.role}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">状态</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          selectedUser.status === '在职' || selectedUser.status === 'active' ? 'bg-emerald-100 text-emerald-800' 
                          : selectedUser.status === '试用期' ? 'bg-amber-100 text-amber-800'
                          : selectedUser.status === '离职' || selectedUser.status === 'inactive' ? 'bg-slate-200 text-slate-800'
                          : 'bg-blue-100 text-blue-800'
                        }`}>
                          {selectedUser.status === 'active' ? '在职' : selectedUser.status === 'inactive' ? '离职' : selectedUser.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">入职时间</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.joinDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">工龄</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.yearsOfService}</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">合同与权限</h4>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">用工形式</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.employmentType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">合同到期</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.contractExpiry}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500 dark:text-slate-400">系统角色</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {selectedUser.systemRole === SystemRole.SUPER_ADMIN ? '超级管理员' : 
                           selectedUser.systemRole === SystemRole.ADMIN ? '管理员' : 
                           selectedUser.systemRole === SystemRole.HR ? '人事主管' : '普通员工'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    const printWindow = window.open('', '', 'height=400,width=800');
                    if (printWindow) {
                      printWindow.document.write('<html><head><title>打印档案标签</title>');
                      printWindow.document.write('<style>');
                      printWindow.document.write('@page { size: 17cm 4cm; margin: 0; }');
                      printWindow.document.write('body { margin: 0; padding: 0; width: 17cm; height: 4cm; display: flex; align-items: center; justify-content: center; font-family: "SimSun", "STSong", serif; }');
                      printWindow.document.write('.label-container { width: 16.6cm; height: 3.6cm; box-sizing: border-box; padding: 0.3cm 0.5cm; display: flex; flex-direction: column; justify-content: flex-start; border: 1px solid #000; }');
                      printWindow.document.write('.row { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 0.3cm; }');
                      printWindow.document.write('.text-item { font-size: 32px; letter-spacing: 1px; }');
                      printWindow.document.write('.dept { flex: 1; text-align: left; }');
                      printWindow.document.write('.name { flex: 1; text-align: center; }');
                      printWindow.document.write('.role { flex: 1; text-align: right; }');
                      printWindow.document.write('.phone { font-size: 32px; letter-spacing: 1px; text-align: left; }');
                      printWindow.document.write('</style>');
                      printWindow.document.write('</head><body>');
                      printWindow.document.write('<div class="label-container">');
                      printWindow.document.write('<div class="row">');
                      printWindow.document.write(`<div class="text-item dept">${selectedUser.department}</div>`);
                      printWindow.document.write(`<div class="text-item name">${selectedUser.name}</div>`);
                      printWindow.document.write(`<div class="text-item role">${selectedUser.role}</div>`);
                      printWindow.document.write('</div>');
                      printWindow.document.write('<div class="row">');
                      printWindow.document.write(`<div class="phone">${selectedUser.phone}</div>`);
                      printWindow.document.write('</div>');
                      printWindow.document.write('</div>');
                      printWindow.document.write('</body></html>');
                      printWindow.document.close();
                      printWindow.focus();
                      setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                      }, 250);
                    }
                  }}
                  className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  打印档案标签
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const printContent = document.getElementById('printable-contact-card');
                    if (printContent) {
                      const originalContents = document.body.innerHTML;
                      const printWindow = window.open('', '', 'height=600,width=800');
                      if (printWindow) {
                        printWindow.document.write('<html><head><title>打印联系卡</title>');
                        printWindow.document.write('<style>');
                        printWindow.document.write('body { font-family: sans-serif; padding: 20px; }');
                        printWindow.document.write('.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }');
                        printWindow.document.write('.bg-slate-50 { background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; }');
                        printWindow.document.write('.flex { display: flex; justify-content: space-between; margin-bottom: 8px; }');
                        printWindow.document.write('.text-sm { font-size: 14px; }');
                        printWindow.document.write('.text-slate-500 { color: #64748b; }');
                        printWindow.document.write('.font-medium { font-weight: 500; }');
                        printWindow.document.write('h4 { margin-top: 0; margin-bottom: 10px; color: #475569; }');
                        printWindow.document.write('@media print { .md\\:col-span-2 { grid-column: span 2; } }');
                        printWindow.document.write('</style>');
                        printWindow.document.write('</head><body>');
                        printWindow.document.write(`<h2>${selectedUser.name} - 联系卡</h2>`);
                        printWindow.document.write(printContent.innerHTML);
                        printWindow.document.write('</body></html>');
                        printWindow.document.close();
                        printWindow.focus();
                        setTimeout(() => {
                          printWindow.print();
                          printWindow.close();
                        }, 250);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  打印联系卡
                </button>
                {hasPermission(Permission.MANAGE_USERS) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleEdit(selectedUser);
                    }}
                    className="px-4 py-2 bg-blue-600 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    编辑信息
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
              aria-hidden="true"
              onClick={() => setIsModalOpen(false)}
            ></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            {/* Modal panel */}
            <div className="relative z-10 inline-block align-bottom w-full bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full animate-in zoom-in-95 duration-200">
              <div className="flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-4 sm:px-6 border-b border-slate-100 bg-white shrink-0">
                  <h3 className="text-lg leading-6 font-medium text-slate-900" id="modal-title">
                    {editingUser ? '编辑员工信息' : '新增员工'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-500 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Body */}
                <div className="bg-white px-4 py-5 sm:p-6 overflow-y-auto flex-1">
                  <form id="employee-form" className="space-y-6" onSubmit={(e) => { e.preventDefault(); setIsModalOpen(false); }}>
                  {/* 基本信息 */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-500 pl-2">基本信息</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">姓名 <span className="text-red-500">*</span></label>
                        <input required type="text" defaultValue={editingUser?.name || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">身份证号码 <span className="text-red-500">*</span></label>
                        <input required type="text" defaultValue={editingUser?.idCard || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">联系电话 <span className="text-red-500">*</span></label>
                        <input required type="text" defaultValue={editingUser?.phone || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700">户口地址 <span className="text-red-500">*</span></label>
                        <input required type="text" defaultValue={editingUser?.registeredAddress || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700">现住址 <span className="text-red-500">*</span></label>
                        <input required type="text" defaultValue={editingUser?.currentAddress || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* 工作信息 */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-500 pl-2">工作信息</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">部门 <span className="text-red-500">*</span></label>
                        <DepartmentTreeSelect 
                          required 
                          value={selectedDeptName}
                          onChange={setSelectedDeptName}
                          departments={departments}
                          placeholder="请选择部门"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">职位 <span className="text-red-500">*</span></label>
                        <RoleTreeSelect 
                          required 
                          value={selectedRoleName}
                          onChange={setSelectedRoleName}
                          onDeptChange={setSelectedDeptName}
                          departments={departments}
                          roles={roles}
                          placeholder="请选择职位"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">状态 <span className="text-red-500">*</span></label>
                        <CustomCombobox 
                          required 
                          options={['在职', '离职', '试用期']}
                          defaultValue={editingUser?.status === 'active' ? '在职' : editingUser?.status === 'inactive' ? '离职' : (editingUser?.status || '在职')} 
                          placeholder="选择或输入状态"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">入职时间 <span className="text-red-500">*</span></label>
                        <input required type="date" defaultValue={editingUser?.joinDate || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">用工形式 <span className="text-red-500">*</span></label>
                        <CustomCombobox 
                          required 
                          options={['全职', '兼职', '实习', '外包', '退休返聘']}
                          defaultValue={editingUser?.employmentType || '全职'} 
                          placeholder="选择或输入用工形式"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">变动情况 <span className="text-red-500">*</span></label>
                        <input required type="text" defaultValue={editingUser?.changeStatus || '无'} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">系统角色 <span className="text-red-500">*</span></label>
                        <CustomCombobox 
                          required 
                          options={['超级管理员', '管理员', '人事主管', '普通员工']}
                          defaultValue={
                            editingUser?.systemRole === SystemRole.SUPER_ADMIN ? '超级管理员' : 
                            editingUser?.systemRole === SystemRole.ADMIN ? '管理员' : 
                            editingUser?.systemRole === SystemRole.HR ? '人事主管' : '普通员工'
                          } 
                          placeholder="选择系统角色"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 合同与社保 */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-500 pl-2">合同与社保</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">是否购买社保</label>
                        <CustomCombobox 
                          defaultValue={editingUser?.hasSocialSecurity || '是'}
                          options={['是', '否']}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">合同年限(年)</label>
                        <input type="number" defaultValue={editingUser?.contractYears || 3} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">最新签订时间</label>
                        <input type="date" defaultValue={editingUser?.contractSignDate || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* 退役军人信息 */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-500 pl-2">退役军人信息</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">是否退役军人</label>
                        <CustomCombobox 
                          defaultValue={editingUser?.isVeteran || '否'}
                          options={['是', '否']}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">原服役单位</label>
                        <input type="text" defaultValue={editingUser?.formerUnit || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">入伍及退役时间</label>
                        <input type="text" defaultValue={editingUser?.militaryDates || ''} placeholder="如: 2015-09 至 2017-09" className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* 备注 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700">备注</label>
                    <textarea rows={2} defaultValue={editingUser?.remarks || ''} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"></textarea>
                  </div>
                </form>
              </div>
              
              {/* Footer */}
              <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-200 shrink-0">
                <button type="submit" form="employee-form" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 sm:ml-3 sm:w-auto sm:text-sm">保存</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">取消</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
