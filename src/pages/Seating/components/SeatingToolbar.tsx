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
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">自动排座模块</h1>
        <p className="text-sm text-slate-500 mt-1">根据部门和职位优先级自动分配桌号，支持导出 A4 台卡</p>
      </div>
      <div className="flex items-center space-x-3">
        <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="网格视图"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="列表视图"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        {hasTables && (
          <button
            onClick={handleClear}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium shadow-sm"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            重置
          </button>
        )}
        {hasUploadedUsers && (
          <button
            onClick={clearUploadedUsers}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-sm font-medium shadow-sm"
            title="清除上传的名单，恢复系统人员"
          >
            <X className="w-4 h-4 mr-2" />
            清除名单
          </button>
        )}
        <div className="relative" onMouseLeave={() => setIsUploadMenuOpen(false)}>
          <button
            onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Upload className="w-4 h-4 mr-2" />
            导入名单
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>
          {isUploadMenuOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
              <button
                onClick={() => {
                  handleDownloadTemplate();
                  setIsUploadMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center"
              >
                <FileDown className="w-4 h-4 mr-2" />
                下载模板
              </button>
              <label className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center cursor-pointer mb-0">
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
          className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Users className="w-4 h-4 mr-2" />
          选择人员 ({selectedCount})
        </button>
        <button
          onClick={() => setIsPrintModalOpen(true)}
          disabled={!hasTables}
          className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
        >
          <Settings2 className="w-4 h-4 mr-2" />
          台卡设置
        </button>
        <button
          onClick={handlePrint}
          disabled={!hasTables}
          className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
        >
          <Printer className="w-4 h-4 mr-2" />
          打印台卡
        </button>
        <button
          onClick={handleAutoArrange}
          className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          自动排座
        </button>
      </div>
    </div>
  );
}
