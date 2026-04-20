import React from 'react';
import { FileText, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { DocumentSet, Document, Folder as FolderType } from '../../../store/useDocumentStore';

interface SetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSet: DocumentSet | null;
  handleSaveSet: (e: React.FormEvent<HTMLFormElement>) => void;
  folders: FolderType[];
  documents: Document[];
  selectedDocIds: string[];
  onDocToggleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  expandedModalFolders: Set<string>;
  toggleAllModalFolders: () => void;
  toggleModalFolder: (id: string) => void;
  printSettings: Record<string, { duplex: boolean; color: boolean; copies: number }>;
  onSetColorClick: (id: string, color: boolean) => void;
  onSetDuplexClick: (id: string, duplex: boolean) => void;
  onSetCopiesClick: (id: string, action: 'inc' | 'dec') => void;
}

export function SetFormModal({
  isOpen,
  onClose,
  editingSet,
  handleSaveSet,
  folders,
  documents,
  selectedDocIds,
  onDocToggleChange,
  expandedModalFolders,
  toggleAllModalFolders,
  toggleModalFolder,
  printSettings,
  onSetColorClick,
  onSetDuplexClick,
  onSetCopiesClick,
}: SetFormModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingSet ? '编辑文件套件' : '新建文件套件'}
      size="lg"
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
            form="set-form"
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
          >
            保存
          </button>
        </>
      }
    >
      <form id="set-form" onSubmit={handleSaveSet} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            套件名称 <span className="text-red-500">*</span>
          </label>
          <input
            required
            autoFocus
            name="name"
            type="text"
            defaultValue={editingSet?.name}
            placeholder="如：入职文件套件"
            className="block w-full border border-zinc-200/80 dark:border-zinc-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">描述说明</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={editingSet?.description}
            placeholder="简要说明该套件的用途"
            className="block w-full border border-zinc-200/80 dark:border-zinc-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm resize-none"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">选择包含的文件</label>
            <button
              type="button"
              onClick={toggleAllModalFolders}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              {expandedModalFolders.size === folders.filter((f) => documents.some((d) => d.folderId === f.id)).length &&
              expandedModalFolders.size > 0
                ? '全部收起'
                : '全部展开'}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-800/50 p-2 space-y-1">
            {documents.length === 0 ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
                暂无文件，请先在文件库上传
              </div>
            ) : (
              <>
                {/* Root files */}
                {documents
                  .filter((d) => d.folderId === null)
                  .map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-center p-2 hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-600"
                    >
                      <input
                        type="checkbox"
                        data-docid={doc.id}
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={onDocToggleChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200 dark:border-zinc-700/80 rounded"
                      />
                      <FileText className="w-4 h-4 ml-3 mr-2 text-zinc-400 dark:text-zinc-500" />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{doc.name}</span>
                    </label>
                  ))}

                {/* Folders and their files */}
                {folders.map((folder) => {
                  const folderDocs = documents.filter((d) => d.folderId === folder.id);
                  if (folderDocs.length === 0) return null;
                  const isExpanded = expandedModalFolders.has(folder.id);
                  return (
                    <div key={folder.id} className="pt-2">
                      <div
                        className="flex items-center px-2 py-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        onClick={() => toggleModalFolder(folder.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 mr-1" />
                        ) : (
                          <ChevronRight className="w-3 h-3 mr-1" />
                        )}
                        <Folder className="w-3 h-3 mr-1.5" />
                        {folder.name}
                      </div>
                      {isExpanded && (
                        <div className="pl-4 space-y-1 mt-1">
                          {folderDocs.map((doc) => (
                            <label
                              key={doc.id}
                              className="flex items-center p-2 hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-600"
                            >
                              <input
                                type="checkbox"
                                data-docid={doc.id}
                                checked={selectedDocIds.includes(doc.id)}
                                onChange={onDocToggleChange}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200 dark:border-zinc-700/80 rounded"
                              />
                              <FileText className="w-4 h-4 ml-3 mr-2 text-zinc-400 dark:text-zinc-500" />
                              <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{doc.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {selectedDocIds.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              已选文件打印设置
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {selectedDocIds.map((id) => {
                const doc = documents.find((d) => d.id === id);
                if (!doc) return null;
                const settings = printSettings[id] || { duplex: false, color: false, copies: 1 };
                return (
                  <div
                    key={id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-md border border-zinc-200 dark:border-zinc-700 gap-2"
                  >
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1" title={doc.name}>
                      {doc.name}
                    </span>
                    <div className="flex items-center space-x-3 shrink-0">
                      <div className="flex items-center space-x-1 bg-white dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600 p-0.5">
                        <button
                          type="button"
                          onClick={() => onSetColorClick(id, false)}
                          className={`px-2 py-1 text-xs rounded ${!settings.color ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}
                        >
                          黑白
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetColorClick(id, true)}
                          className={`px-2 py-1 text-xs rounded ${settings.color ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-zinc-500 dark:text-zinc-400'}`}
                        >
                          彩色
                        </button>
                      </div>
                      <div className="flex items-center space-x-1 bg-white dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600 p-0.5">
                        <button
                          type="button"
                          onClick={() => onSetDuplexClick(id, false)}
                          className={`px-2 py-1 text-xs rounded ${!settings.duplex ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}
                        >
                          单面
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetDuplexClick(id, true)}
                          className={`px-2 py-1 text-xs rounded ${settings.duplex ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-zinc-500 dark:text-zinc-400'}`}
                        >
                          双面
                        </button>
                      </div>
                      <div className="flex items-center bg-white dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600">
                        <button
                          type="button"
                          onClick={() => onSetCopiesClick(id, 'dec')}
                          className="px-2 py-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-300"
                        >
                          -
                        </button>
                        <span className="text-xs w-6 text-center text-zinc-700 dark:text-zinc-300">
                          {settings.copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSetCopiesClick(id, 'inc')}
                          className="px-2 py-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-300"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </BaseModal>
  );
}
