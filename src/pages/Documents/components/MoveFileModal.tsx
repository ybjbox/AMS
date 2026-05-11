import React from 'react';
import { FolderOpen, Folder } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Folder as FolderType } from '@/store/useDocumentStore';

interface MoveFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderType[];
  targetFolderId: string | null;
  onTargetFolderChange: (folderId: string | null) => void;
  handleMoveFile: () => void;
}

export function MoveFileModal({
  isOpen,
  onClose,
  folders,
  targetFolderId,
  onTargetFolderChange,
  handleMoveFile,
}: MoveFileModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="移动文件"
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
            onClick={handleMoveFile}
            className="btn-primary w-full sm:w-auto"
          >
            确认移动
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">选择目标文件夹</label>
          <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-800/50 p-2 space-y-1">
            <label className="flex items-center p-2 hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-600">
              <input
                type="radio"
                name="targetFolder"
                checked={targetFolderId === null}
                onChange={() => {
                  onTargetFolderChange(null);
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200 dark:border-zinc-700/80"
              />
              <FolderOpen className="w-4 h-4 ml-3 mr-2 text-zinc-400 dark:text-zinc-500" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">全部文件 (根目录)</span>
            </label>
            {folders.map((folder) => (
              <label
                key={folder.id}
                className="flex items-center p-2 hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-600"
              >
                <input
                  type="radio"
                  name="targetFolder"
                  checked={targetFolderId === folder.id}
                  onChange={() => {
                    onTargetFolderChange(folder.id);
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200 dark:border-zinc-700/80"
                />
                <Folder className="w-4 h-4 ml-3 mr-2 text-zinc-400 dark:text-zinc-500" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{folder.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
