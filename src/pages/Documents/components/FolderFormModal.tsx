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
            className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
          >
            取消
          </button>
          <button
            type="submit"
            form="folder-form"
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
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
