import { Permission } from "@/components/Permission";
import React from 'react';
import { Printer, Edit, FileSignature } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { User, SystemRole } from '@/types';
import { formatPhone } from '@/utils/dateUtils';
import { toast } from 'sonner';
import { printInWindow } from '@/utils/printWindow';
import { buildContactCardPrintHtml, buildLabelPrintHtml } from '../utils/printHtml';
import { BusinessFormRecords } from './BusinessFormRecords';
import { UserAccountSection } from './UserAccountSection';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUser: User | null;
  handleEdit: (user: User) => void;
  onRenew: (user: User) => void;
}

export function UserDetailModal({ isOpen, onClose, selectedUser, handleEdit, onRenew }: UserDetailModalProps) {
  return (
    <BaseModal
      isOpen={isOpen && !!selectedUser}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg mr-4">
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
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedUser) return;
              if (!printInWindow(buildLabelPrintHtml(selectedUser), 'height=400,width=800')) {
                toast.error('打印窗口被浏览器拦截，请允许弹窗后重试');
              }
            }}
            className="btn-primary w-full sm:w-auto"
          >
            <Printer className="w-4 h-4 mr-2" />
            打印档案标签
          </button>
          <button
            type="button"
            onClick={() => {
              const printContent = document.getElementById('printable-contact-card');
              if (!selectedUser || !printContent) return;
              if (
                !printInWindow(buildContactCardPrintHtml(selectedUser.name, printContent.innerHTML), 'height=600,width=800')
              ) {
                toast.error('打印窗口被浏览器拦截，请允许弹窗后重试');
              }
            }}
            className="btn-primary w-full sm:w-auto"
          >
            <Printer className="w-4 h-4 mr-2" />
            打印联系卡
          </button>
          <Permission code="users:manage">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (selectedUser) handleEdit(selectedUser);
              }}
              className="btn-primary w-full sm:w-auto"
            >
              <Edit className="w-4 h-4 mr-2" />
              编辑信息
            </button>
          </Permission>
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
                  <span className="text-sm font-medium text-zinc-900 dark:text-white tabular-nums">{formatPhone(selectedUser.phone)}</span>
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
                      selectedUser.status === '在职'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedUser.status === '试用期'
                          ? 'bg-amber-100 text-amber-800'
                          : selectedUser.status === '离职'
                            ? 'bg-zinc-200 text-zinc-800 dark:text-zinc-200'
                            : 'bg-zinc-100 text-zinc-800'
                    }`}
                  >
                    {selectedUser.status}
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
                          : selectedUser.systemRole === SystemRole.EMPLOYEE
                            ? '普通员工'
                            : '未开通账号'}
                  </span>
                </div>
                {selectedUser && (
                  <Permission code="users:manage">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => onRenew(selectedUser)}
                    >
                      <FileSignature className="w-3.5 h-3.5" aria-hidden="true" />
                      合同续签
                    </Button>
                  </Permission>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 账号与业务单据两块都在打印卡片之外，避免被「打印联系卡」带进纸张 */}
      {selectedUser && <UserAccountSection employee={selectedUser} />}
      {selectedUser && <BusinessFormRecords employee={selectedUser} />}
    </BaseModal>
  );
}
