import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { useDepartments } from '@/store/useDepartmentStore';
import { Armchair, Printer, RefreshCw } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { User } from '@/types';

import { SeatingToolbar } from './components/SeatingToolbar';
import { TableConfig } from './components/TableConfig';
import { TableCard } from './components/TableCard';
import { ParticipantModal } from './components/ParticipantModal';
import { PrintSettingsModal } from './components/PrintSettingsModal';
import { PrintPreview } from './components/PrintPreview';

import { useSeatingArrange } from './hooks/useSeatingArrange';
import { usePrintSettings } from './hooks/usePrintSettings';

export default function Seating() {
  const users = useEmployeeStore((state) => state.users);
  const departments = useDepartments((state) => state.departments);
  const roles = useDepartments((state) => state.roles);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [uploadedUsers, setUploadedUsers] = useState<User[] | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPrintWarningOpen, setIsPrintWarningOpen] = useState(false);

  const activeUsers = useMemo(() => {
    if (uploadedUsers) return uploadedUsers;
    return users.filter((u) => u.status !== '离职');
  }, [users, uploadedUsers]);

  const { printSettings, setPrintSettings } = usePrintSettings();
  const {
    tableCapacities,
    tables,
    skippedNumbers,
    setSkippedNumbers,
    addTableCapacity,
    updateTableCapacity,
    removeTableCapacity,
    handleAutoArrange,
    handleClear,
    removeTable,
  } = useSeatingArrange(activeUsers, selectedUserIds, departments, roles);

  useEffect(() => {
    if (!uploadedUsers && activeUsers.length > 0 && selectedUserIds.size === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedUserIds(new Set(activeUsers.map((u) => u.id)));
    }
  }, [activeUsers, uploadedUsers, selectedUserIds.size]);

  useBodyOverflow(isParticipantModalOpen || isPrintModalOpen || isPrintWarningOpen);

  const handleDownloadTemplate = useCallback(() => {
    toast.info('请求后端下载模板 (Mock)');
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // TODO(backend): 接入真实的 Excel 解析 API（推荐使用已安装的 xlsx 库）
    // 当前为演示模式：忽略文件内容，返回固定测试数据
    setTimeout(() => {
      const demoUsers = [
        {
          id: `demo-${Date.now()}-1`,
          name: '张三（演示）',
          department: '技术部',
          role: '前端工程师',
          status: '在职' as const,
          joinDate: new Date().toISOString(),
        },
        {
          id: `demo-${Date.now()}-2`,
          name: '李四（演示）',
          department: '市场部',
          role: '市场总监',
          status: '在职' as const,
          joinDate: new Date().toISOString(),
        },
      ] as User[];
      setUploadedUsers(demoUsers);
      setSelectedUserIds(new Set(demoUsers.map((u) => u.id)));
      // 警告用户当前为演示数据，非真实文件解析
      toast.warning(`"${file.name}" 已上传，当前使用演示数据（文件内容未实际解析）`);
    }, 500);
    e.target.value = '';
  }, []);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, User[]> = {};
    activeUsers.forEach((u) => {
      if (!groups[u.department || '']) groups[u.department || ''] = [];
      groups[u.department || ''].push(u);
    });
    return groups;
  }, [activeUsers]);

  const getTableDepartments = useCallback((members: User[]) => {
    const depts = new Set(members.map((m) => m.department).filter(Boolean));
    return Array.from(depts).join('、');
  }, []);

  const renderJustifiedName = useCallback((name: string, fontSize: number) => {
    if (name.length <= 4) {
      return (
        <div className="flex justify-between mx-auto" style={{ width: `${fontSize * 4}px` }}>
          {name.split('').map((char, i) => (
            <span key={i}>{char}</span>
          ))}
        </div>
      );
    }
    return <div className="text-center">{name}</div>;
  }, []);

  const toggleUserSelection = useCallback((id: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const toggleDepartmentSelection = useCallback(
    (dept: string, isSelected: boolean) => {
      setSelectedUserIds((prev) => {
        const newSet = new Set(prev);
        groupedUsers[dept]?.forEach((u) => {
          if (isSelected) newSet.add(u.id);
          else newSet.delete(u.id);
        });
        return newSet;
      });
    },
    [groupedUsers]
  );

  const handlePrint = useCallback(() => {
    try {
      if (window.self !== window.top) {
        setIsPrintWarningOpen(true);
      } else {
        window.print();
      }
    } catch {
      setIsPrintWarningOpen(true);
    }
  }, []);

  return (
    <div className="w-full flex flex-col min-h-full">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto w-full print:hidden">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">座位安排</h1>
            <p className="page-subtitle">自动按部门与职位优先级生成座位方案</p>
          </div>
          <div>
            <button
              onClick={handleAutoArrange}
              className="btn-primary"
            >
              <RefreshCw className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">自动排座</span>
            </button>
          </div>
        </div>
        <SeatingToolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          hasTables={tables.length > 0}
          handleClear={handleClear}
          hasUploadedUsers={!!uploadedUsers}
          clearUploadedUsers={() => setUploadedUsers(null)}
          isUploadMenuOpen={isUploadMenuOpen}
          setIsUploadMenuOpen={setIsUploadMenuOpen}
          handleDownloadTemplate={handleDownloadTemplate}
          handleFileUpload={handleFileUpload}
          setIsParticipantModalOpen={setIsParticipantModalOpen}
          selectedCount={selectedUserIds.size}
          setIsPrintModalOpen={setIsPrintModalOpen}
          handlePrint={handlePrint}
        />

        <TableConfig
          tableCapacities={tableCapacities}
          addTableCapacity={addTableCapacity}
          updateTableCapacity={updateTableCapacity}
          removeTableCapacity={removeTableCapacity}
          skippedNumbers={skippedNumbers}
          setSkippedNumbers={setSkippedNumbers}
          selectedCount={selectedUserIds.size}
        />

        {tables.length > 0 ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {tables.map((table) => (
              <TableCard key={table.number} table={table} viewMode={viewMode} onRemove={removeTable} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Armchair}
            title="准备好开始排座了吗？"
            description="点击右上角的“自动排座”按钮，系统将根据员工的部门和职位优先级为您生成最佳方案。"
            action={
              <button onClick={handleAutoArrange} className="btn-primary">
                自动排座
              </button>
            }
          />
        )}
      </div>

      <ParticipantModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        groupedUsers={groupedUsers}
        selectedUserIds={selectedUserIds}
        toggleUserSelection={toggleUserSelection}
        toggleDepartmentSelection={toggleDepartmentSelection}
      />

      <PrintSettingsModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        printSettings={printSettings}
        setPrintSettings={setPrintSettings}
        tables={tables}
        handlePrint={handlePrint}
        getTableDepartments={getTableDepartments}
        renderJustifiedName={renderJustifiedName}
      />

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
              className="btn-secondary sm:w-auto w-full"
            >
              我知道了
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPrintWarningOpen(false);
                window.print();
              }}
              className="btn-primary sm:w-auto w-full"
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
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                由于您当前处于预览模式，浏览器的打印功能可能无法正常工作。
                <br />
                <br />
                请点击右上角的<strong className="text-zinc-700 dark:text-zinc-300">“在新标签页中打开”</strong>
                按钮，或者复制当前网址到新标签页中打开，然后再进行打印。
              </p>
            </div>
          </div>
        </div>
      </BaseModal>

      <PrintPreview
        tables={tables}
        printSettings={printSettings}
        getTableDepartments={getTableDepartments}
        renderJustifiedName={renderJustifiedName}
      />
    </div>
  );
}
