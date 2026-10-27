import { Pressable } from '@/components/ui/Pressable';
import React from 'react';
import {
  LayoutGrid,
  List,
  Trash2,
  FolderClock,
  Users,
  Printer,
} from 'lucide-react';

interface SeatingToolbarProps {
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  hasTables: boolean;
  handleClear: () => void;
  setIsParticipantModalOpen: (isOpen: boolean) => void;
  selectedCount: number;
  setIsPrintModalOpen: (isOpen: boolean) => void;
  setIsPlansModalOpen: (isOpen: boolean) => void;
  /** 有排座结果但服务端还没有这个版本 */
  unsaved: boolean;
}

export function SeatingToolbar({
  viewMode,
  setViewMode,
  hasTables,
  handleClear,
  setIsParticipantModalOpen,
  selectedCount,
  setIsPrintModalOpen,
  setIsPlansModalOpen,
  unsaved,
}: SeatingToolbarProps) {
  return (
      <div className="toolbar shrink-0">
        <div className="flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-1 shadow-sm">
          <Pressable
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
            title="网格视图"
          >
            <LayoutGrid className="w-4 h-4" />
          </Pressable>
          <Pressable
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
            title="列表视图"
          >
            <List className="w-4 h-4" />
          </Pressable>
        </div>
        {hasTables && (
          <Pressable
            onClick={handleClear}
            aria-label="重置排座"
            className="btn-danger max-sm:min-h-11"
          >
            <Trash2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">重置</span>
          </Pressable>
        )}
        <Pressable
          onClick={() => setIsPlansModalOpen(true)}
          aria-label="排座方案"
          className="btn-secondary relative max-sm:min-h-11"
        >
          <FolderClock className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">方案</span>
          {unsaved && (
            <span
              className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-800"
              title="当前排座还有未保存的改动"
            />
          )}
        </Pressable>
        <Pressable
          onClick={() => setIsParticipantModalOpen(true)}
          aria-label={`选择人员，已选 ${selectedCount} 人`}
          className="btn-secondary max-sm:min-h-11"
        >
          <Users className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">选择人员 ({selectedCount})</span>
          <span className="sm:hidden">({selectedCount})</span>
        </Pressable>
        {/* 一个入口：弹窗里就是「左设置 + 右预览 + 打印」，不再单列一个跳过预览直接出纸的按钮 */}
        <Pressable
          onClick={() => setIsPrintModalOpen(true)}
          disabled={!hasTables}
          aria-label="打印台卡"
          className="btn-secondary disabled:opacity-50 max-sm:min-h-11"
        >
          <Printer className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">打印台卡</span>
        </Pressable>
      </div>
  );
}
