import React from 'react';
import { X, Upload, ChevronDown, FileDown, FileText, Users, Printer } from 'lucide-react';
import { User } from '@/types';

interface NameCardToolbarProps {
  uploadedUsers: User[] | null;
  setUploadedUsers: React.Dispatch<React.SetStateAction<User[] | null>>;
  isUploadMenuOpen: boolean;
  setIsUploadMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsManualInputOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleDownloadTemplate: () => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setIsParticipantModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedUserIds: Set<string>;
  handlePrint: () => void;
}

export default function NameCardToolbar({
  uploadedUsers,
  setUploadedUsers,
  isUploadMenuOpen,
  setIsUploadMenuOpen,
  setIsManualInputOpen,
  handleDownloadTemplate,
  handleFileUpload,
  setIsParticipantModalOpen,
  selectedUserIds,
  handlePrint,
}: NameCardToolbarProps) {
  return (
    <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">会议台卡</h1>
          <p className="page-subtitle">自定义台卡尺寸、样式并批量打印</p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {uploadedUsers && (
          <button
            onClick={() => setUploadedUsers(null)}
            className="flex items-center px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 rounded-lg text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            title="清除上传的名单，恢复系统人员"
          >
            <X className="h-4 w-4 mr-2" />
            清除名单
          </button>
        )}
        <div className="relative upload-dropdown">
          <button
            onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
            className="flex items-center px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Upload className="h-4 w-4 mr-2" />
            导入名单
            <ChevronDown className="h-4 w-4 ml-1" />
          </button>
          {isUploadMenuOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-50">
              <button
                onClick={() => {
                  handleDownloadTemplate();
                  setIsUploadMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center"
              >
                <FileDown className="w-4 h-4 mr-2" />
                下载模板
              </button>
              <button
                onClick={() => {
                  setIsManualInputOpen(true);
                  setIsUploadMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center"
              >
                <FileText className="w-4 h-4 mr-2" />
                手动输入
              </button>
              <label className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center cursor-pointer mb-0">
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
          className="flex items-center px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <Users className="h-4 w-4 mr-2" />
          选择人员 ({selectedUserIds.size})
        </button>
        <button
          onClick={handlePrint}
          disabled={selectedUserIds.size === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer className="h-4 w-4 mr-2" />
          打印台卡
        </button>
      </div>
    </div>
  );
}
