import { Pressable } from '@/components/ui/Pressable';
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
import { expiryBucket, expiryCounts, EXPIRY_BUCKET_LABEL, type ExpiryBucket } from './utils/expiryBucket';
import { cn } from '@/lib/utils';

// 状态筛选选项（value 与展示文案不一致，交由 ui/Select 的 items 映射）
const STATUS_OPTIONS = [
  { value: 'ALL', label: '所有状态' },
  { value: '在职', label: '在职' },
  { value: '试用期', label: '试用期' },
  { value: '离职', label: '离职' },
];

export default function ContractsPage() {
  const users = useEmployeeStore((state) => state.users);
  /** 名单没拉到时，合同表不能显示成"没有符合条件的记录"（审查 M1） */
  const usersLoadError = useEmployeeStore((state) => state.error);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);

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
  /** 到期分档筛选：点顶部那行数字即切换（与状态筛选同样是 URL 态，可深链） */
  const filterBucket = urlState.get('bucket');
  const setFilterBucket = useCallback(
    (b: string) => urlState.set({ bucket: !b || b === 'ALL' ? null : b, page: null }),
    [urlState]
  );

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);

  const { handlePrint, handleDirectPrint, isDoubleSided, setIsDoubleSided } = useContractPrint(setSelectedUser);

  useBodyOverflow(isPreviewOpen || isTemplateEditorOpen);

  /** 搜索 + 在职状态筛完的那一份：顶部量级数字按它算，所以数字永远等于"点进去能看到的" */
  const scopedUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'ALL' || user.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, filterStatus]);

  const counts = useMemo(() => expiryCounts(scopedUsers), [scopedUsers]);

  const filteredUsers = useMemo(
    () => (filterBucket ? scopedUsers.filter((u) => expiryBucket(u) === filterBucket) : scopedUsers),
    [scopedUsers, filterBucket]
  );

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
      <div className="relative max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-slow">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">合同管理</h1>
            <p className="page-subtitle">劳动合同管理、生成与打印</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Pressable
              onClick={() => setIsTemplateEditorOpen(true)}
              aria-label="模板设置"
              className="btn-secondary max-sm:min-h-11"
            >
              <FileEdit className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">模板设置</span>
            </Pressable>
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
                <SelectTrigger aria-label="筛选员工状态" className="w-45">
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

          {/*
            到期量级。原先页面上只有逐行的红色徽章，于是"到底几个人合同过期了"
            这个问题没有答案 —— 得自己一页页数。每个数字点下去就是筛选，
            所以它们不是装饰；数字按上面搜索+状态筛完的集合算，点进去必然看到这么多行。
          */}
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 text-xs">
            {(['expired', 'soon', 'none', 'ok'] as ExpiryBucket[]).map((b) => {
              const n = counts[b];
              const active = filterBucket === b;
              const tone =
                b === 'expired' && n > 0
                  ? 'text-red-700 dark:text-red-400'
                  : b === 'soon' && n > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-muted-foreground';
              return (
                <Pressable
                  key={b}
                  type="button"
                  aria-pressed={active}
                  disabled={n === 0 && !active}
                  onClick={() => setFilterBucket(active ? 'ALL' : b)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 transition-colors duration-quick',
                    tone,
                    active
                      ? 'border-brand-500 bg-brand-50 font-medium dark:bg-brand-500/15'
                      : 'border-zinc-200 dark:border-zinc-600',
                    n === 0 && !active && 'opacity-50'
                  )}
                >
                  {EXPIRY_BUCKET_LABEL[b]} <span className="font-semibold tabular-nums">{n}</span>
                </Pressable>
              );
            })}
            {filterBucket && (
              <Pressable type="button" onClick={() => setFilterBucket('ALL')} className="text-muted-foreground underline underline-offset-2">
                清除分档
              </Pressable>
            )}
          </div>

          <ContractTable
            filteredUsers={paginatedUsers}
            loadError={usersLoadError}
            onRetry={() => void fetchUsers({ force: true })}
            onPreview={handlePreview}
            onDirectPrint={handleDirectPrint}
          />
          {/* 右侧渐变遮罩提示可横向滚动（仅移动端） */}
          <div className="absolute right-0 top-13 bottom-0 w-8 bg-gradient-to-l from-white dark:from-zinc-800 to-transparent pointer-events-none md:hidden" />
          
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
