import React from 'react';
import { FileText, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DocumentSet, Document, Folder as FolderType } from '@/store/useDocumentStore';

interface SetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSet: DocumentSet | null;
  handleSaveSet: (e: React.FormEvent<HTMLFormElement>) => void;
  folders: FolderType[];
  documents: Document[];
  selectedDocIds: string[];
  onDocToggleChange: (docId: string, checked: boolean) => void;
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
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <button
            type="submit"
            form="set-form"
            className="btn-primary w-full sm:w-auto"
          >
            保存
          </button>
        </>
      }
    >
      <form id="set-form" onSubmit={handleSaveSet} className="space-y-4">
        <div>
          <label htmlFor="set-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            套件名称 <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <Input
            id="set-name"
            required
            autoFocus
            name="name"
            type="text"
            defaultValue={editingSet?.name}
            placeholder="如：入职文件套件"
          />
        </div>
        <div>
          <label htmlFor="set-description" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">描述说明</label>
          <Textarea
            id="set-description"
            name="description"
            rows={2}
            defaultValue={editingSet?.description}
            placeholder="简要说明该套件的用途"
            className="field-sizing-fixed resize-y"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            {/* 分组标签：它管的是下面整组复选框，不是某一个控件，所以不绑 htmlFor。
                用 role="group" + aria-labelledby 让读屏把这组复选框当成一个整体来念。 */}
            <div
              role="group"
              aria-labelledby="set-files-label"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              <span id="set-files-label">选择包含的文件</span>
            </div>
            {/* min-h-6：实测 58×22 低于 WCAG 2.2 AA 的 24px 命中区（2.5.8）。
                size="xs" 的 22px 高度只差 2px，加 min-h-6 补到 24px，
                字号与配色不变（variant="link" 不带边框，加边框会改变版面）。 */}
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={toggleAllModalFolders}
              className="h-auto min-h-6 px-0 text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium"
            >
              {expandedModalFolders.size === folders.filter((f) => documents.some((d) => d.folderId === f.id)).length &&
              expandedModalFolders.size > 0
                ? '全部收起'
                : '全部展开'}
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-800/50 p-2 space-y-1">
            {documents.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
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
                      htmlFor={`doc-toggle-${doc.id}`}
                      className="flex items-center p-2 hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-600"
                    >
                      <Checkbox
                        id={`doc-toggle-${doc.id}`}
                        checked={selectedDocIds.includes(doc.id)}
                        onCheckedChange={(checked) => onDocToggleChange(doc.id, checked)}
                        className="border-zinc-300 dark:border-zinc-600"
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
                        className="flex items-center px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
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
                              htmlFor={`doc-toggle-${doc.id}`}
                              className="flex items-center p-2 hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-600"
                            >
                              <Checkbox
                                id={`doc-toggle-${doc.id}`}
                                checked={selectedDocIds.includes(doc.id)}
                                onCheckedChange={(checked) => onDocToggleChange(doc.id, checked)}
                                className="border-zinc-300 dark:border-zinc-600"
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
            {/* 同上：分组标签，管的是下面每个文件的打印设置，不绑单个控件 */}
            <div
              role="group"
              aria-labelledby="set-print-label"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              <span id="set-print-label">已选文件打印设置</span>
            </div>
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
                      {/* 分段胶囊/步进器嵌在共享边框盒里，选中底色与圆角属于版面对象，换 Button 会破坏盒模型，故保留裸 button */}
                      <div className="flex items-center space-x-1 bg-white dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600 p-0.5">
                        <button
                          type="button"
                          onClick={() => onSetColorClick(id, false)}
                          className={`px-2 py-1 text-xs rounded ${!settings.color ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-white' : 'text-muted-foreground'}`}
                        >
                          黑白
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetColorClick(id, true)}
                          className={`px-2 py-1 text-xs rounded ${settings.color ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300' : 'text-muted-foreground'}`}
                        >
                          彩色
                        </button>
                      </div>
                      <div className="flex items-center space-x-1 bg-white dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600 p-0.5">
                        <button
                          type="button"
                          onClick={() => onSetDuplexClick(id, false)}
                          className={`px-2 py-1 text-xs rounded ${!settings.duplex ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-800 dark:text-white' : 'text-muted-foreground'}`}
                        >
                          单面
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetDuplexClick(id, true)}
                          className={`px-2 py-1 text-xs rounded ${settings.duplex ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300' : 'text-muted-foreground'}`}
                        >
                          双面
                        </button>
                      </div>
                      <div className="flex items-center bg-white dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600">
                        <button
                          type="button"
                          onClick={() => onSetCopiesClick(id, 'dec')}
                          className="px-2 py-1 text-muted-foreground hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-300"
                        >
                          -
                        </button>
                        <span className="text-xs w-6 text-center text-zinc-700 dark:text-zinc-300">
                          {settings.copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSetCopiesClick(id, 'inc')}
                          className="px-2 py-1 text-muted-foreground hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-300"
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
