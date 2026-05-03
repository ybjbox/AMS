import React, { useState, useMemo, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useDepartments } from '@/store/useDepartmentStore';
import { useUserStore as useAuthStore } from '@/store/useUserStore';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { User } from '@/types';
import { UserTable } from '@/components/users/UserTable';
import { UserToolbar } from './components/UserToolbar';
import { UserFormModal } from './components/UserFormModal';
import { UserDetailModal } from './components/UserDetailModal';
import { ExportModal } from './components/ExportModal';
import { AddressBookModal } from './components/AddressBookModal';
import { useUserFilters } from './hooks/useUserFilters';
import { useExport } from './hooks/useExport';
import { Pagination } from '@/components/ui/Pagination';
import { RosterPrintTemplate, AddressBookPrintTemplate } from './components/PrintTemplates';

export default function Users() {
  const confirm = useConfirm();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const users = useEmployeeStore((state) => state.users);
  const isLoading = useEmployeeStore((state) => state.isLoading);
  const deleteUser = useEmployeeStore((state) => state.deleteUser);

  const allDepartments = useDepartments((state) => state.departments);
  const roles = useDepartments((state) => state.roles);
  const departments = useMemo(() => allDepartments, [allDepartments]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState<string>('');
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');

  const {
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    isFilterOpen,
    setIsFilterOpen,
    filters,
    handleFilterChange,
    clearFilters,
    activeFilterCount,
    currentUsers,
    filteredUsers,
    totalPages,
    itemsPerPage,
  } = useUserFilters(users);

  const {
    isExporting,
    isExportModalOpen,
    setIsExportModalOpen,
    isAddressBookModalOpen,
    setIsAddressBookModalOpen,
    themes,
    scripts,
    exportConfig,
    setExportConfig,
    addressBookConfig,
    setAddressBookConfig,
    addressBookPrintRef,
    rosterPrintRef,
    processedAddressBookUsers,
    leftUsers,
    rightUsers,
    previewLeft,
    previewRight,
    handleExport,
    handlePrintRoster,
    handlePrintAddressBook,
  } = useExport(users);

  useBodyOverflow(isModalOpen || isDetailModalOpen || isExportModalOpen || isAddressBookModalOpen);

  const handleAdd = useCallback(() => {
    setEditingUser(null);
    setSelectedDeptName('');
    setSelectedRoleName('');
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((user: User) => {
    setEditingUser(user);
    setSelectedDeptName(user.department || '');
    setSelectedRoleName(user.role || '');
    setIsModalOpen(true);
  }, []);

  return (
    <>
      {/* ── 主内容布局 ── */}
      <div className="w-full flex flex-col p-4 sm:p-6 lg:p-8 min-h-full">
        <div className="space-y-6 animate-in fade-in duration-500 w-full flex-1 flex flex-col min-h-0">
          <div className="card-base flex flex-col flex-1 min-h-0">
            <div className="shrink-0">
              <UserToolbar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                isFilterOpen={isFilterOpen}
                setIsFilterOpen={setIsFilterOpen}
                activeFilterCount={activeFilterCount}
                clearFilters={clearFilters}
                filters={filters}
                handleFilterChange={handleFilterChange}
                departments={departments}
                hasPermission={hasPermission}
                setIsAddressBookModalOpen={setIsAddressBookModalOpen}
                setIsExportModalOpen={setIsExportModalOpen}
                handleAdd={handleAdd}
              />
            </div>
            <div className="flex-1 min-h-0">
              <UserTable
                data={currentUsers}
                isLoading={isLoading}
                onEdit={handleEdit}
                onDelete={async (user) => {
                  if (
                    await confirm({
                      title: `确定要删除员工 ${user.name} 吗？`,
                      description: '此操作不可恢复。',
                      variant: 'danger',
                    })
                  ) {
                    deleteUser(user.id);
                  }
                }}
                onRowClick={(user) => {
                  setSelectedUser(user);
                  setIsDetailModalOpen(true);
                }}
              />
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredUsers.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>
      {/* ── 弹窗层（Portal 渲染，不参与布局） ── */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        exportConfig={exportConfig}
        setExportConfig={setExportConfig}
        themes={themes}
        scripts={scripts}
        isExporting={isExporting}
        handleExport={handleExport}
        handlePrintRoster={handlePrintRoster}
        users={users}
        filteredUsersLength={filteredUsers.length}
      />
      <AddressBookModal
        isOpen={isAddressBookModalOpen}
        onClose={() => setIsAddressBookModalOpen(false)}
        addressBookConfig={addressBookConfig}
        setAddressBookConfig={setAddressBookConfig}
        handlePrintAddressBook={handlePrintAddressBook}
        processedAddressBookUsers={processedAddressBookUsers}
        previewLeft={previewLeft}
        previewRight={previewRight}
      />
      <UserDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedUser={selectedUser}
        hasPermission={hasPermission}
        handleEdit={handleEdit}
      />
      <UserFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingUser={editingUser}
        departments={departments}
        roles={roles}
        selectedDeptName={selectedDeptName}
        setSelectedDeptName={setSelectedDeptName}
        selectedRoleName={selectedRoleName}
        setSelectedRoleName={setSelectedRoleName}
      />
      {/* ── 打印模板（hidden，不参与布局） ── */}
      <RosterPrintTemplate
        printRef={rosterPrintRef}
        title={exportConfig.title}
        columns={exportConfig.columns}
        users={users}
        includeResigned={exportConfig.includeResigned}
      />
      <AddressBookPrintTemplate
        printRef={addressBookPrintRef}
        title={addressBookConfig.title}
        columns={addressBookConfig.columns}
        isTwoColumn={addressBookConfig.isTwoColumn}
        mergeDepartments={addressBookConfig.mergeDepartments}
        leftUsers={leftUsers}
        rightUsers={rightUsers}
      />
    </>
  );
}
