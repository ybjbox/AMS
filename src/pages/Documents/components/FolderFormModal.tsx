import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Folder as FolderType } from '@/store/useDocumentStore';

interface FolderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingFolder: FolderType | null;
  handleSaveFolder: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function FolderFormModal({ isOpen, onClose, editingFolder, handleSaveFolder }: FolderFormModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingFolder ? '重命名文件夹' : '新建文件夹'}
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
            form="folder-form"
            className="btn-primary w-full sm:w-auto"
          >
            保存
          </button>
        </>
      }
    >
      <form id="folder-form" onSubmit={handleSaveFolder} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            文件夹名称 <span className="text-red-500">*</span>
          </label>
          <input
            required
            autoFocus
            name="name"
            type="text"
            defaultValue={editingFolder?.name}
            placeholder="如：人事文件"
            className="block w-full border border-zinc-200/80 dark:border-zinc-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
          />
        </div>
      </form>
    </BaseModal>
  );
}
