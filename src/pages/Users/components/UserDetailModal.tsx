import React from 'react';
import { Printer, Edit } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { User, SystemRole } from '@/types';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUser: User | null;
  hasPermission: (permission: string) => boolean;
  handleEdit: (user: User) => void;
}

export function UserDetailModal({ isOpen, onClose, selectedUser, hasPermission, handleEdit }: UserDetailModalProps) {
  return (
    <BaseModal
      isOpen={isOpen && !!selectedUser}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mr-4">
            {selectedUser?.name.charAt(0)}
          </div>
          员工详细信息
        </div>
      }
      size="2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedUser) return;
              const printWindow = window.open('', '', 'height=400,width=800');
              if (printWindow) {
                printWindow.document.write('<html><head><title>打印档案标签</title>');
                printWindow.document.write('<style>');
                printWindow.document.write('@page { size: 17cm 4cm; margin: 0; }');
                printWindow.document.write(
                  'body { margin: 0; padding: 0; width: 17cm; height: 4cm; display: flex; align-items: center; justify-content: center; font-family: "SimSun", "STSong", serif; }'
                );
                printWindow.document.write(
                  '.label-container { width: 16.6cm; height: 3.6cm; box-sizing: border-box; padding: 0.3cm 0.5cm; display: flex; flex-direction: column; justify-content: flex-start; border: 1px solid #000; }'
                );
                printWindow.document.write(
                  '.row { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 0.3cm; }'
                );
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
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
          >
            <Printer className="w-4 h-4 mr-2" />
            打印档案标签
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedUser) return;
              const printContent = document.getElementById('printable-contact-card');
              if (printContent) {
                const printWindow = window.open('', '', 'height=600,width=800');
                if (printWindow) {
                  printWindow.document.write('<html><head><title>打印联系卡</title>');
                  printWindow.document.write('<style>');
                  printWindow.document.write('body { font-family: sans-serif; padding: 20px; }');
                  printWindow.document.write('.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }');
                  printWindow.document.write(
                    '.bg-zinc-50 { background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; }'
                  );
                  printWindow.document.write(
                    '.flex { display: flex; justify-content: space-between; margin-bottom: 8px; }'
                  );
                  printWindow.document.write('.text-sm { font-size: 14px; }');
                  printWindow.document.write('.text-zinc-500 { color: #64748b; }');
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
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
          >
            <Printer className="w-4 h-4 mr-2" />
            打印联系卡
          </button>
          {hasPermission('users:manage') && (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (selectedUser) handleEdit(selectedUser);
              }}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
            >
              <Edit className="w-4 h-4 mr-2" />
              编辑信息
            </button>
          )}
        </>
      }
    >
      {selectedUser && (
        <div id="printable-contact-card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">基本信息</h4>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">姓名</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">工号</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">性别</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">年龄</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.age}岁</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">联系电话</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.phone}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">工作信息</h4>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">部门</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">职位</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">状态</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      selectedUser.status === '在职' || selectedUser.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedUser.status === '试用期'
                          ? 'bg-amber-100 text-amber-800'
                          : selectedUser.status === '离职' || selectedUser.status === 'inactive'
                            ? 'bg-zinc-200 text-zinc-800 dark:text-zinc-200'
                            : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {selectedUser.status === 'active'
                      ? '在职'
                      : selectedUser.status === 'inactive'
                        ? '离职'
                        : selectedUser.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">入职时间</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{selectedUser.joinDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">工龄</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">
                    {selectedUser.yearsOfService}
                  </span>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">合同与权限</h4>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">用工形式</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">
                    {selectedUser.employmentType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">合同到期</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">
                    {selectedUser.contractExpiry}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">系统角色</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">
                    {selectedUser.systemRole === SystemRole.SUPER_ADMIN
                      ? '超级管理员'
                      : selectedUser.systemRole === SystemRole.ADMIN
                        ? '管理员'
                        : selectedUser.systemRole === SystemRole.HR
                          ? '人事主管'
                          : '普通员工'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </BaseModal>
  );
}
