import React, { useState, useMemo, useCallback } from 'react';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { Search, Filter, FileEdit } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { ContractTable } from './components/ContractTable';
import { ContractPreviewModal } from './components/ContractPreviewModal';
import { ContractTemplateEditor } from './components/ContractTemplateEditor';
import { useContractPrint } from './hooks/useContractPrint';
import { ContractTemplate } from './components/ContractTemplate';

export default function ContractsPage() {
  const users = useEmployeeStore((state) => state.users);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);

  const { handlePrint, handleDirectPrint, isDoubleSided, setIsDoubleSided } = useContractPrint(setSelectedUser);

  useBodyOverflow(isPreviewOpen || isTemplateEditorOpen);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'ALL' || user.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, filterStatus]);

  const handlePreview = useCallback((user: User) => {
    setSelectedUser(user);
    setIsPreviewOpen(true);
  }, []);

  return (
    <div className="w-full flex flex-col p-4 sm:p-6 lg:p-8 min-h-full">
      <div className="relative max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-500">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">合同管理</h1>
            <p className="page-subtitle">劳动合同管理、生成与打印</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsTemplateEditorOpen(true)}
              className="btn-secondary"
            >
              <FileEdit className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">模板设置</span>
            </button>
          </div>
        </div>

        <div className="card-base min-h-0 flex-1 overflow-hidden flex flex-col">
          <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="搜索员工姓名、工号或部门..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-base pl-10"
              />
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <Filter className="w-4 h-4 text-zinc-400" />
              <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || 'ALL')}>
                <SelectTrigger className="w-[180px] text-sm border-zinc-200/80 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white">
                  <SelectValue placeholder="选择状态">
                    {(val) =>
                      val === 'ALL'
                        ? '所有状态'
                        : val === '在职'
                          ? '在职'
                          : val === '试用期'
                            ? '试用期'
                            : val === '离职'
                              ? '离职'
                              : '选择状态'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有状态</SelectItem>
                  <SelectItem value="在职">在职</SelectItem>
                  <SelectItem value="试用期">试用期</SelectItem>
                  <SelectItem value="离职">离职</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ContractTable
            filteredUsers={filteredUsers}
            onPreview={handlePreview}
            onDirectPrint={handleDirectPrint}
          />
        </div>
        {/* 右侧渐变遮罩提示可横向滚动 */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-zinc-900 to-transparent pointer-events-none md:hidden rounded-br-xl" />
      </div>

      <ContractPreviewModal
        isOpen={isPreviewOpen}
        selectedUser={selectedUser}
        onClose={() => setIsPreviewOpen(false)}
        isDoubleSided={isDoubleSided}
        setIsDoubleSided={setIsDoubleSided}
        handlePrint={handlePrint}
      />

      <ContractTemplateEditor
        isOpen={isTemplateEditorOpen}
        onClose={() => setIsTemplateEditorOpen(false)}
      />

      {/* Hidden Printable Area for Direct Print */}
      <div className="hidden">
        <div>{selectedUser && <ContractTemplate user={selectedUser} />}</div>
      </div>
    </div>
  );
}
