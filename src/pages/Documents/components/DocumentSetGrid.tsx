import React from 'react';
import { Folder, Edit2, Trash2, FileText, Printer, Plus } from 'lucide-react';
import { DocumentSet, Document } from '../../../store/documents';
import { EmptyState } from '@/components/ui/EmptyState';

interface DocumentSetGridProps {
  documentSets: DocumentSet[];
  documents: Document[];
  isLoading: boolean;
  onEditSetClick: (set: DocumentSet) => void;
  onDeleteSetClick: (id: string) => void;
  onPrintSetClick: (set: DocumentSet) => void;
  handleCreateSetClick: () => void;
}

export function DocumentSetGrid({
  documentSets,
  documents,
  isLoading,
  onEditSetClick,
  onDeleteSetClick,
  onPrintSetClick,
  handleCreateSetClick,
}: DocumentSetGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {isLoading ? (
        <div className="col-span-full text-center py-16 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl">
          <div className="flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 dark:text-slate-400">加载中...</p>
          </div>
        </div>
      ) : documentSets.length === 0 ? (
        <div className="col-span-full">
          <EmptyState
            title="暂无文件套件"
            description="点击右上角新建套件，将常用文件组合在一起"
            icon={Folder}
            action={
              <button
                onClick={handleCreateSetClick}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                立即创建
              </button>
            }
          />
        </div>
      ) : (
        documentSets.map((set) => (
          <div
            key={set.id}
            className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{set.name}</h3>
                <div className="flex space-x-1">
                  <button
                    onClick={() => onEditSetClick(set)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                    title="编辑套件"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteSetClick(set.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    title="删除套件"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[40px]">{set.description}</p>
            </div>
            <div className="p-5 flex-1 bg-slate-50/50 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                包含文件 ({set.documentIds.length})
              </div>
              <ul className="space-y-2">
                {set.documentIds.slice(0, 3).map((id) => {
                  const doc = documents.find((d) => d.id === id);
                  if (!doc) return null;
                  return (
                    <li key={id} className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                      <FileText className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="truncate">{doc.name}</span>
                    </li>
                  );
                })}
                {set.documentIds.length > 3 && (
                  <li className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                    ... 等共 {set.documentIds.length} 份文件
                  </li>
                )}
                {set.documentIds.length === 0 && (
                  <li className="text-sm text-slate-500 dark:text-slate-400 italic">未选择任何文件</li>
                )}
              </ul>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
              <button
                onClick={() => onPrintSetClick(set)}
                disabled={set.documentIds.length === 0}
                className="w-full flex items-center justify-center px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4 mr-2" />
                一键打印套件
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
