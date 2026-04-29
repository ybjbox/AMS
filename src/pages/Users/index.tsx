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
import { ExportColumn } from './constants';
import { Pagination } from '@/components/common/Pagination';

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
            totalCount={filteredUsers.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>

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

      {/* Hidden Printable Area for Roster */}
      <div className="hidden">
        <div ref={rosterPrintRef}>
          <h1>{exportConfig.title}</h1>
          <table>
            <thead>
              <tr>
                {exportConfig.columns
                  .filter((c: ExportColumn) => c.selected)
                  .map((col: ExportColumn) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => (exportConfig.includeResigned ? true : u.status !== '离职'))
                .map((u) => (
                  <tr key={u.id}>
                    {exportConfig.columns
                      .filter((c: ExportColumn) => c.selected)
                      .map((col: ExportColumn) => (
                        <td key={col.key}>{(u as unknown as Record<string, unknown>)[col.key] as string || '-'}</td>
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
          <div className={addressBookConfig.isTwoColumn ? 'flex gap-5 items-start' : 'block'}>
            <div className="flex-1">
              <table className="w-full border-collapse text-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {addressBookConfig.columns
                      .filter((c: ExportColumn) => c.selected)
                      .map((col: ExportColumn) => (
                        <th key={col.key} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left' }}>
                          {col.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {leftUsers.map((user: User & { _deptSpan?: number; _deptCount?: number }, idx: number) => (
                    <tr key={user.id || idx}>
                      {addressBookConfig.columns
                        .filter((c: ExportColumn) => c.selected)
                        .map((col: ExportColumn) => {
                          if (col.key === 'department' && addressBookConfig.mergeDepartments) {
                            if (user._deptSpan === 0) return null;
                            return (
                              <td
                                key={col.key}
                                rowSpan={user._deptSpan}
                                style={{
                                  border: '1px solid #000',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  verticalAlign: 'middle',
                                }}
                              >
                                {(user as unknown as Record<string, unknown>)[col.key] as string || '-'}
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                  ({user._deptCount}人)
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td
                              key={col.key}
                              style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}
                            >
                              {(user as unknown as Record<string, unknown>)[col.key] as string || '-'}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {addressBookConfig.isTwoColumn && (
              <div className="flex-1">
                <table className="w-full border-collapse text-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {addressBookConfig.columns
                        .filter((c: ExportColumn) => c.selected)
                        .map((col: ExportColumn) => (
                          <th key={col.key} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left' }}>
                            {col.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rightUsers.map((user: User & { _deptSpan?: number; _deptCount?: number }, idx: number) => (
                      <tr key={user.id || idx}>
                        {addressBookConfig.columns
                          .filter((c: ExportColumn) => c.selected)
                          .map((col: ExportColumn) => {
                            if (col.key === 'department' && addressBookConfig.mergeDepartments) {
                              if (user._deptSpan === 0) return null;
                              return (
                                <td
                                  key={col.key}
                                  rowSpan={user._deptSpan}
                                  style={{
                                    border: '1px solid #000',
                                    padding: '4px 6px',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {(user as unknown as Record<string, unknown>)[col.key] as string || '-'}
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                    ({user._deptCount}人)
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td
                                key={col.key}
                                style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}
                              >
                                {(user as unknown as Record<string, unknown>)[col.key] as string || '-'}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
