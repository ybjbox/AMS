import React from 'react';
import { FolderOpen, Folder } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Folder as FolderType } from '../../../store/documents';

interface MoveFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderType[];
  targetFolderId: string | null;
  onTargetFolderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMoveFile: () => void;
}

export function MoveFileModal({
  isOpen,
  onClose,
  folders,
  targetFolderId,
  onTargetFolderChange,
  handleMoveFile
}: MoveFileModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="移动文件"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm">取消</button>
          <button onClick={handleMoveFile} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm">确认移动</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">选择目标文件夹</label>
          <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 space-y-1">
            <label className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
              <input 
                type="radio" 
                name="targetFolder" 
                checked={targetFolderId === null}
                onChange={(e) => { (e.currentTarget as any).dataset.folderid = 'null'; onTargetFolderChange(e); }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200/80"
              />
              <FolderOpen className="w-4 h-4 ml-3 mr-2 text-slate-400 dark:text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">全部文件 (根目录)</span>
            </label>
            {folders.map(folder => (
              <label key={folder.id} className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                <input 
                  type="radio" 
                  name="targetFolder" 
                  checked={targetFolderId === folder.id}
                  onChange={(e) => { (e.currentTarget as any).dataset.folderid = folder.id; onTargetFolderChange(e); }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200/80"
                />
                <Folder className="w-4 h-4 ml-3 mr-2 text-slate-400 dark:text-slate-500" />
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{folder.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
