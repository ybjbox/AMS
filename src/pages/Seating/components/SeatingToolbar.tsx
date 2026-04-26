import React from 'react';
import {
  LayoutGrid,
  List,
  Trash2,
  X,
  Upload,
  ChevronDown,
  FileDown,
  Users,
  Settings2,
  Printer,
  RefreshCw,
} from 'lucide-react';

interface SeatingToolbarProps {
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  hasTables: boolean;
  handleClear: () => void;
  hasUploadedUsers: boolean;
  clearUploadedUsers: () => void;
  isUploadMenuOpen: boolean;
  setIsUploadMenuOpen: (isOpen: boolean) => void;
  handleDownloadTemplate: () => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setIsParticipantModalOpen: (isOpen: boolean) => void;
  selectedCount: number;
  setIsPrintModalOpen: (isOpen: boolean) => void;
  handlePrint: () => void;
  handleAutoArrange: () => void;
}

export function SeatingToolbar({
  viewMode,
  setViewMode,
  hasTables,
  handleClear,
  hasUploadedUsers,
  clearUploadedUsers,
  isUploadMenuOpen,
  setIsUploadMenuOpen,
  handleDownloadTemplate,
  handleFileUpload,
  setIsParticipantModalOpen,
  selectedCount,
  setIsPrintModalOpen,
  handlePrint,
  handleAutoArrange,
}: SeatingToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">宴会排座</h1>
          <p className="page-subtitle">自动编排座位并生成可打印席卡</p>
        </div>
        <div>
          <button
            onClick={handleAutoArrange}
            className="btn-primary"
          >
            <RefreshCw className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">自动排座</span>
          </button>
        </div>
      </div>
      <div className="toolbar">
        <div className="flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
            title="网格视图"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
            title="列表视图"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        {hasTables && (
          <button
            onClick={handleClear}
            className="btn-danger"
          >
            <Trash2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">重置</span>
          </button>
        )}
        {hasUploadedUsers && (
          <button
            onClick={clearUploadedUsers}
            className="btn-secondary text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            title="清除上传的名单，恢复系统人员"
          >
            <X className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">清除名单</span>
          </button>
        )}
        <div className="relative" onMouseLeave={() => setIsUploadMenuOpen(false)}>
          <button
            onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
            className="btn-secondary"
          >
            <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">导入名单</span>
            <ChevronDown className="w-4 h-4 ml-1 hidden sm:block" />
          </button>
          {isUploadMenuOpen && (
            <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 w-36 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-50">
              <button
                onClick={() => {
                  handleDownloadTemplate();
                  setIsUploadMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center"
              >
                <FileDown className="w-4 h-4 mr-2" />
                下载模板
              </button>
              <label className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center cursor-pointer mb-0">
                <Upload className="w-4 h-4 mr-2" />
                上传文件
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    handleFileUpload(e);
                    setIsUploadMenuOpen(false);
                  }}
                />
              </label>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsParticipantModalOpen(true)}
          className="btn-secondary"
        >
          <Users className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">选择人员 ({selectedCount})</span>
          <span className="sm:hidden">({selectedCount})</span>
        </button>
        <button
          onClick={() => setIsPrintModalOpen(true)}
          disabled={!hasTables}
          className="btn-secondary disabled:opacity-50"
        >
          <Settings2 className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">台卡设置</span>
        </button>
        <button
          onClick={handlePrint}
          disabled={!hasTables}
          className="btn-secondary disabled:opacity-50"
        >
          <Printer className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">打印台卡</span>
        </button>
      </div>
    </div>
  );
}
