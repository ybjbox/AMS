import PageContainer from "@/components/PageContainer";
import React, { useState, useMemo, useCallback } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { Search, Filter, FileEdit } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { Input } from '@/components/ui/input';
import { ContractTable } from './components/ContractTable';
import { Pagination } from '@/components/ui/Pagination';
import { ContractPreviewModal } from './components/ContractPreviewModal';
import { ContractTemplateEditor } from './components/ContractTemplateEditor';
import { useContractPrint } from './hooks/useContractPrint';
import { ContractTemplate } from './components/ContractTemplate';

// 状态筛选选项（value 与展示文案不一致，交由 ui/Select 的 items 映射）
const STATUS_OPTIONS = [
  { value: 'ALL', label: '所有状态' },
  { value: '在职', label: '在职' },
  { value: '试用期', label: '试用期' },
  { value: '离职', label: '离职' },
];

export default function ContractsPage() {
  const users = useEmployeeStore((state) => state.users);

  // 搜索/筛选/分页状态与 URL 同步（刷新保持、可深链）
  const urlState = useUrlState();
  const searchQuery = urlState.get('q');
  const filterStatus = urlState.get('status', 'ALL');
  const currentPage = urlState.getNumber('page', 1);
  const setSearchQuery = useCallback(
    (q: string) => urlState.set({ q, page: null }),
    [urlState]
  );
  const setFilterStatus = useCallback(
    (s: string) => urlState.set({ status: s === 'ALL' ? null : s, page: null }),
    [urlState]
  );
  const setCurrentPage = useCallback(
    (p: number) => urlState.set({ page: p <= 1 ? null : p }),
    [urlState]
  );

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

  const ITEMS_PER_PAGE = 20;
  // 当筛选条件变化时重置页码
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const safePage = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1));
  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, safePage]);

  const handlePreview = useCallback((user: User) => {
    setSelectedUser(user);
    setIsPreviewOpen(true);
  }, []);

  return (
    <PageContainer width="none">
      <div className="relative max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-400">
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

        <div className="card-base min-h-0 flex-1 overflow-hidden flex flex-col relative">
          <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="搜索员工姓名、工号或部门…"
                aria-label="搜索员工姓名、工号或部门"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <Filter className="w-4 h-4 text-zinc-400" />
              <Select
                value={filterStatus}
                onValueChange={(val) => {
                  setFilterStatus(val || 'ALL');
                }}
                items={STATUS_OPTIONS}
              >
                <SelectTrigger aria-label="筛选员工状态" className="w-[180px]">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ContractTable
            filteredUsers={paginatedUsers}
            onPreview={handlePreview}
            onDirectPrint={handleDirectPrint}
          />
          {/* 右侧渐变遮罩提示可横向滚动（仅移动端） */}
          <div className="absolute right-0 top-[53px] bottom-0 w-8 bg-gradient-to-l from-white dark:from-zinc-800 to-transparent pointer-events-none md:hidden" />
          
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filteredUsers.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </div>
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
    </PageContainer>
  );
}
