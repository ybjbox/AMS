import { Pressable } from '@/components/ui/Pressable';
import React from 'react';
import { Folder, Edit2, Trash2, FileText, Printer, Plus } from 'lucide-react';
import { DocumentSet, Document } from '@/store/useDocumentStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { Button } from '@/components/ui/button';
import { hasPermission } from '@/utils/permission';

interface DocumentSetGridProps {
  documentSets: DocumentSet[];
  documents: Document[];
  isLoading: boolean;
  /** 拉取失败的原因：空列表时必须与「真的没有套件」区分开（审查 M1） */
  loadError?: string | null;
  onRetry?: () => void;
  onEditSetClick: (set: DocumentSet) => void;
  onDeleteSetClick: (id: string) => void;
  onPrintSetClick: (set: DocumentSet) => void;
  handleCreateSetClick: () => void;
}

export function DocumentSetGrid({
  documentSets,
  documents,
  isLoading,
  loadError,
  onRetry,
  onEditSetClick,
  onDeleteSetClick,
  onPrintSetClick,
  handleCreateSetClick,
}: DocumentSetGridProps) {
  const canManageDocs = hasPermission('documents:manage');
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {isLoading ? (
        <div className="col-span-full text-center py-16 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl">
          <div className="flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mb-4"></div>
            <p className="text-muted-foreground">加载中…</p>
          </div>
        </div>
      ) : loadError && documentSets.length === 0 ? (
        <div className="col-span-full">
          <FailedState subject="文件套件" reason={loadError} onRetry={onRetry} />
        </div>
      ) : documentSets.length === 0 ? (
        <div className="col-span-full">
          <EmptyState
            title="暂无文件套件"
            description={canManageDocs ? '点击右上角新建套件，将常用文件组合在一起' : '暂无文件套件'}
            icon={Folder}
            action={canManageDocs ? (
              <Pressable
                onClick={handleCreateSetClick}
                className="btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                立即创建
              </Pressable>
            ) : undefined}
          />
        </div>
      ) : (
        documentSets.map((set) => {
          // 套件里记的是 documentIds，而文件可能已被删除 —— 列表对找不到的那条
          // `if (!doc) return null` 静默跳过，所以计数必须按**解析得到的**那批算，
          // 否则会出现"写着 5 份、下面只列得出 3 行"（审查 F1）。
          const found = set.documentIds
            .map((id) => documents.find((d) => d.id === id))
            .filter((d): d is Document => Boolean(d));
          const missing = set.documentIds.length - found.length;
          return (
          <div
            key={set.id}
            className="bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-700">
              <div className="flex justify-between items-start mb-2">
                <div className="text-lg font-semibold text-zinc-900 dark:text-white">{set.name}</div>
                {canManageDocs && (
                <div className="flex space-x-1">
                  <Pressable
                    onClick={() => onEditSetClick(set)}
                    className="p-1.5 text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md transition-colors"
                    title="编辑套件"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Pressable>
                  <Pressable
                    onClick={() => onDeleteSetClick(set.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    title="删除套件"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Pressable>
                </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">{set.description}</p>
            </div>
            <div className="p-5 flex-1 bg-zinc-50/50 dark:bg-zinc-800/50">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                包含文件 ({found.length})
                {missing > 0 && (
                  <span className="ml-1.5 normal-case tracking-normal text-red-600 dark:text-red-400">
                    另有 {missing} 个已被删除
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {found.slice(0, 3).map((doc) => (
                  <li key={doc.id} className="flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                    <FileText className="w-4 h-4 mr-2 text-zinc-400 dark:text-zinc-500 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                  </li>
                ))}
                {/* 标题已经报了总数，这里只说"没列出来的还有几份"，不再重复一遍 */}
                {found.length > 3 && (
                  <li className="text-xs text-muted-foreground pt-1">还有 {found.length - 3} 份未列出</li>
                )}
                {found.length === 0 && (
                  <li className="text-sm text-muted-foreground italic">
                    {set.documentIds.length === 0 ? '未选择任何文件' : '里面的文件都已被删除'}
                  </li>
                )}
              </ul>
            </div>
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <Button
                onClick={() => onPrintSetClick(set)}
                // 按"还能打印几份"判空：文件全被删掉的套件，点打印只会得到空任务
                disabled={found.length === 0}
                size="lg"
                className="w-full"
              >
                <Printer className="w-4 h-4 mr-2" />
                一键打印套件
              </Button>
            </div>
          </div>
          );
        })
      )}
    </div>
  );
}
