import React, { useCallback } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { FileText, CheckSquare, Square, ChevronRight } from 'lucide-react';
import { User } from '@/types';

interface NameCardModalsProps {
  isParticipantModalOpen: boolean;
  setIsParticipantModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  expandedDepts: Set<string>;
  toggleAllDeptsExpand: () => void;
  groupedUsers: Record<string, User[]>;
  selectedUserIds: Set<string>;
  toggleDepartmentSelection: (dept: string, isSelected: boolean) => void;
  setExpandedDepts: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleUserSelection: (id: string) => void;

  isManualInputOpen: boolean;
  setIsManualInputOpen: React.Dispatch<React.SetStateAction<boolean>>;
  manualInputText: string;
  setManualInputText: React.Dispatch<React.SetStateAction<string>>;
  handleManualInputSubmit: () => void;
}

export default function NameCardModals({
  isParticipantModalOpen,
  setIsParticipantModalOpen,
  expandedDepts,
  toggleAllDeptsExpand,
  groupedUsers,
  selectedUserIds,
  toggleDepartmentSelection,
  setExpandedDepts,
  toggleUserSelection,

  isManualInputOpen,
  setIsManualInputOpen,
  manualInputText,
  setManualInputText,
  handleManualInputSubmit
}: NameCardModalsProps) {

  const onToggleDepartmentSelectionClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const dept = e.currentTarget.dataset.dept;
      const allSelectedStr = e.currentTarget.dataset.allselected;
      if (dept && allSelectedStr !== undefined) {
        const allSelected = allSelectedStr === 'true';
        toggleDepartmentSelection(dept, !allSelected);
      }
    },
    [toggleDepartmentSelection]
  );

  const onToggleDeptExpandClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const dept = e.currentTarget.dataset.dept;
    if (dept) {
      setExpandedDepts((prev) => {
        const next = new Set(prev);
        if (next.has(dept)) {
          next.delete(dept);
        } else {
          next.add(dept);
        }
        return next;
      });
    }
  }, [setExpandedDepts]);

  return (
    <>
      <BaseModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        title={
          <div className="flex items-center space-x-4">
            <span className="text-lg leading-6 font-medium text-zinc-900 dark:text-white">选择参与人员</span>
            <button
              onClick={toggleAllDeptsExpand}
              className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium"
            >
              {expandedDepts.size === Object.keys(groupedUsers).length ? '全部收起' : '全部展开'}
            </button>
          </div>
        }
        size="2xl"
        bodyClassName="p-4 sm:p-6 max-h-[60vh] overflow-y-auto"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsParticipantModalOpen(false)}
              className="btn-secondary w-full sm:w-auto"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => setIsParticipantModalOpen(false)}
              className="btn-primary w-full sm:w-auto"
            >
              完成
            </button>
          </>
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
                  className="bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
                  data-dept={dept}
                  data-allselected={String(allSelected)}
                  onClick={onToggleDepartmentSelectionClick}
                >
                  <div className="flex items-center">
                    {allSelected ? (
                      <CheckSquare className="w-5 h-5 text-brand-600 dark:text-brand-600 mr-3" />
                    ) : someSelected ? (
                      <div className="w-5 h-5 bg-gradient-to-b from-brand-600 to-brand-700 shadow-inner dark:bg-brand-600 rounded flex items-center justify-center mr-3">
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
                    data-dept={dept}
                    onClick={onToggleDeptExpandClick}
                    className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    aria-label={isExpanded ? `收起部门：${dept}` : `展开部门：${dept}`}
                    aria-expanded={isExpanded}
                  >
                    <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700">
                    {deptUsers.map((u) => {
                      const checkboxId = `namecard-participant-user-${u.id}`;
                      return (
                        <label
                          key={u.id}
                          htmlFor={checkboxId}
                          className="flex items-center space-x-2.5 cursor-pointer group min-h-11 -my-1 py-1"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={selectedUserIds.has(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                          />
                          <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white">
                            {u.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </BaseModal>

      <BaseModal
        isOpen={isManualInputOpen}
        onClose={() => setIsManualInputOpen(false)}
        title="手动输入名单"
        size="2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsManualInputOpen(false)}
              className="btn-secondary w-full sm:w-auto"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleManualInputSubmit}
              className="btn-primary w-full sm:w-auto"
            >
              确认导入
            </button>
          </>
        }
      >
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-brand-100 dark:bg-brand-900/30 sm:mx-0 sm:h-10 sm:w-10">
            <FileText className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
            <div className="mt-2">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                请输入人员名单，每行一个。支持使用空格或逗号分隔姓名、部门和职务。例如：
                <br />
                <span className="font-mono bg-zinc-100 dark:bg-zinc-700 px-1 rounded">张三 技术部 工程师</span>
              </p>
              <Textarea
                rows={10}
                className="field-sizing-fixed w-full resize-y font-mono"
                placeholder="张三 技术部 工程师&#10;李四 市场部 总监"
                value={manualInputText}
                onChange={(e) => setManualInputText(e.target.value)}
              />
            </div>
          </div>
        </div>
      </BaseModal>
    </>
  );
}
