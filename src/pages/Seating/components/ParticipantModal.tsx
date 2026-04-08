import React, { useState, useCallback } from 'react';
import { CheckSquare, Square, ChevronRight } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';

interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedUsers: Record<string, any[]>;
  selectedUserIds: Set<string>;
  toggleUserSelection: (id: string) => void;
  toggleDepartmentSelection: (dept: string, isSelected: boolean) => void;
}

export function ParticipantModal({
  isOpen,
  onClose,
  groupedUsers,
  selectedUserIds,
  toggleUserSelection,
  toggleDepartmentSelection
}: ParticipantModalProps) {
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const toggleAllDeptsExpand = useCallback(() => {
    setExpandedDepts(prev => {
      if (prev.size === Object.keys(groupedUsers).length) {
        return new Set();
      } else {
        return new Set(Object.keys(groupedUsers));
      }
    });
  }, [groupedUsers]);

  const toggleDeptExpand = useCallback((dept: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDepts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dept)) newSet.delete(dept);
      else newSet.add(dept);
      return newSet;
    });
  }, []);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
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
        <button type="button" onClick={onClose} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm">完成</button>
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
                onClick={() => toggleDepartmentSelection(dept, !allSelected)}
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
                  onClick={(e) => toggleDeptExpand(dept, e)}
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
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
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
  );
}
