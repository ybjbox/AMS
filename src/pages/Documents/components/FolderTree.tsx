import React, { useCallback } from 'react';
import { Folder, ChevronRight, ChevronDown, Plus, Edit2, Trash2, FolderOpen, FolderPlus } from 'lucide-react';
import { Folder as FolderType } from '../../../store/documents';

interface FolderTreeProps {
  folders: FolderType[];
  currentFolderId: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  onSetCurrentFolderClick: (id: string | null) => void;
  onAddSubFolderClick: (id: string) => void;
  onEditFolderClick: (id: string) => void;
  onDeleteFolderClick: (id: string) => void;
  handleCreateRootFolderClick: () => void;
}

export function FolderTree({
  folders,
  currentFolderId,
  expandedFolders,
  toggleFolder,
  onSetCurrentFolderClick,
  onAddSubFolderClick,
  onEditFolderClick,
  onDeleteFolderClick,
  handleCreateRootFolderClick
}: FolderTreeProps) {
  const renderFolderTree = useCallback((parentId: string | null, level: number = 0) => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    if (childFolders.length === 0) return null;

    return (
      <ul className={`space-y-0.5 ${level > 0 ? 'ml-3 border-l border-slate-200 dark:border-slate-700 pl-1.5 mt-0.5' : ''}`}>
        {childFolders.map(folder => {
          const isExpanded = expandedFolders.has(folder.id);
          const hasChildren = folders.some(f => f.parentId === folder.id);
          const isSelected = currentFolderId === folder.id;

          return (
            <li key={folder.id}>
              <div
                className={`flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors group ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                onClick={() => onSetCurrentFolderClick(folder.id)}
              >
                <div className="flex items-center space-x-1.5 overflow-hidden">
                  <button
                    className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
                  >
                    {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5 h-3.5 inline-block" />}
                  </button>
                  <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-sm truncate">{folder.name}</span>
                </div>
                <div className="hidden group-hover:flex items-center space-x-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); onAddSubFolderClick(folder.id); }} className="p-1 text-slate-400 hover:text-blue-600"><Plus className="w-3 h-3"/></button>
                  <button onClick={(e) => { e.stopPropagation(); onEditFolderClick(folder.id); }} className="p-1 text-slate-400 hover:text-emerald-600"><Edit2 className="w-3 h-3"/></button>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteFolderClick(folder.id); }} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
              {isExpanded && renderFolderTree(folder.id, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  }, [folders, expandedFolders, currentFolderId, toggleFolder, onSetCurrentFolderClick, onAddSubFolderClick, onEditFolderClick, onDeleteFolderClick]);

  return (
    <div className="w-full md:w-64 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex flex-col overflow-hidden shrink-0">
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
        <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center">
          <FolderOpen className="w-4 h-4 mr-2 text-slate-400" />
          文件夹
        </span>
        <button 
          onClick={handleCreateRootFolderClick} 
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-md transition-colors"
          title="新建根目录文件夹"
        >
          <FolderPlus className="w-4 h-4"/>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div
          className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors ${currentFolderId === null ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          onClick={() => onSetCurrentFolderClick(null)}
        >
          <div className="w-3.5 h-3.5 mr-1.5" />
          <FolderOpen className={`w-4 h-4 mr-1.5 shrink-0 ${currentFolderId === null ? 'text-blue-600' : 'text-slate-400'}`} />
          <span className="text-sm font-medium">全部文件 (根目录)</span>
        </div>
        <div className="pt-1">
          {renderFolderTree(null)}
        </div>
      </div>
    </div>
  );
}
