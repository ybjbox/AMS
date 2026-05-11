import React, { useState, useCallback } from 'react';
import { CheckSquare, Square, ChevronRight } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';

import { User } from '@/types';

interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedUsers: Record<string, User[]>;
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
  toggleDepartmentSelection,
}: ParticipantModalProps) {
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const toggleAllDeptsExpand = useCallback(() => {
    setExpandedDepts((prev) => {
      if (prev.size === Object.keys(groupedUsers).length) {
        return new Set();
      } else {
        return new Set(Object.keys(groupedUsers));
      }
    });
  }, [groupedUsers]);

  const toggleDeptExpand = useCallback((dept: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDepts((prev) => {
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
          <span className="text-lg leading-6 font-medium text-zinc-900 dark:text-white">选择参与人员</span>
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
        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full sm:w-auto"
        >
          完成
        </button>
      }
    >
      <div className="space-y-4 pr-2">
        {Object.entries(groupedUsers).map(([dept, deptUsers]: [string, User[]]) => {
          const allSelected = deptUsers.every((u) => selectedUserIds.has(u.id));
          const someSelected = deptUsers.some((u) => selectedUserIds.has(u.id)) && !allSelected;
          const isExpanded = expandedDepts.has(dept);
          return (
            <div key={dept} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
              <div
                className="bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                onClick={() => toggleDepartmentSelection(dept, !allSelected)}
              >
                <div className="flex items-center">
                  {allSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-600 mr-3" />
                  ) : someSelected ? (
                    <div className="w-5 h-5 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner dark:bg-blue-600 rounded flex items-center justify-center mr-3">
                      <div className="w-3 h-0.5 bg-white dark:bg-zinc-800"></div>
                    </div>
                  ) : (
                    <Square className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mr-3" />
                  )}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{dept}</span>
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    ({deptUsers.filter((u) => selectedUserIds.has(u.id)).length}/{deptUsers.length})
                  </span>
                </div>
                <button
                  onClick={(e) => toggleDeptExpand(dept, e)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              </div>
              {isExpanded && (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700">
                  {deptUsers.map((u) => (
                    <label key={u.id} className="flex items-center space-x-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                        className="rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-zinc-900"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {u.name}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">({u.role})</span>
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
