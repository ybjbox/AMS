import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
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
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <button
            type="submit"
            form="dept-form"
            className="btn-primary w-full sm:w-auto"
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
            <Input
              type="text"
              disabled
              value={flatDepts.find((d) => d.id === modal.parentId)?.name || ''}
              className="block w-full"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            部门名称 <span className="text-red-500">*</span>
          </label>
          <Input
            required
            autoFocus
            name="name"
            type="text"
            defaultValue={modal.defaultName}
            placeholder="请输入部门名称"
            className="block w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">优先级</label>
          <Input
            name="priority"
            type="number"
            defaultValue={modal.defaultPriority}
            placeholder="数字越大越靠前"
            className="block w-full"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">数字越大，在列表中的排序越靠前</p>
        </div>
      </form>
    </BaseModal>
  );
}
