import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { DeptModalState } from '../hooks/useDepartments';
import { DepartmentNode } from '@/types';

interface DepartmentModalProps {
  modal: DeptModalState;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  flatDepts: DepartmentNode[];
}

export function DepartmentModal({ modal, onClose, onSubmit, flatDepts }: DepartmentModalProps) {
  return (
    <BaseModal
      isOpen={modal.isOpen}
      onClose={onClose}
      title={modal.mode === 'add' ? (modal.parentId ? '新增子部门' : '新增一级部门') : '编辑部门'}
      size="md"
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
            type="submit"
            form="dept-form"
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
          >
            保存
          </button>
        </>
      }
    >
      <form id="dept-form" onSubmit={onSubmit} className="space-y-4">
        {modal.mode === 'add' && modal.parentId && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">上级部门</label>
            <input
              type="text"
              disabled
              value={flatDepts.find((d) => d.id === modal.parentId)?.name || ''}
              className="block w-full border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 rounded-md shadow-sm py-2 px-3 text-zinc-500 dark:text-zinc-400 sm:text-sm"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            部门名称 <span className="text-red-500">*</span>
          </label>
          <input
            required
            autoFocus
            name="name"
            type="text"
            defaultValue={modal.defaultName}
            placeholder="请输入部门名称"
            className="block w-full border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">优先级</label>
          <input
            name="priority"
            type="number"
            defaultValue={modal.defaultPriority}
            placeholder="数字越大越靠前"
            className="block w-full border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">数字越大，在列表中的排序越靠前</p>
        </div>
      </form>
    </BaseModal>
  );
}
