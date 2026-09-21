import React from 'react';
import { X, FileText, Users, Printer } from 'lucide-react';
import { User } from '@/types';

interface NameCardToolbarProps {
  uploadedUsers: User[] | null;
  setUploadedUsers: React.Dispatch<React.SetStateAction<User[] | null>>;
  setIsManualInputOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsParticipantModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedUserIds: Set<string>;
  handlePrint: () => void;
}

export default function NameCardToolbar({
  uploadedUsers,
  setUploadedUsers,
  setIsManualInputOpen,
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
            className="btn-secondary text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            title="清除上传的名单，恢复系统人员"
          >
            <X className="h-4 w-4 mr-2" />
            清除名单
          </button>
        )}
        <button
          onClick={() => setIsManualInputOpen(true)}
          className="btn-secondary"
          title="粘贴一份「姓名 部门 职位」名单，只为这次做台卡"
        >
          <FileText className="h-4 w-4 mr-2" />
          粘贴名单
        </button>
        {uploadedUsers && (
          <span className="text-xs text-zinc-400">当前名单为粘贴内容，非员工档案</span>
        )}
        <button
          onClick={() => setIsParticipantModalOpen(true)}
          className="btn-secondary"
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
