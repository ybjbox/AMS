import { Button } from '@/components/ui/button';
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
    <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 sm:px-6 sm:py-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
      <div className="page-header min-w-0">
        <div>
          <h1 className="page-title">会议台卡</h1>
          <p className="page-subtitle">自定义台卡尺寸、样式并批量打印</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end md:gap-3">
        {uploadedUsers && (
          <Button
            variant="outline"
            size="page"
            onClick={() => setUploadedUsers(null)}
            className="text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
            title="清除上传的名单，恢复系统人员"
          >
            <X className="h-4 w-4" />
            清除名单
          </Button>
        )}
        <Button
          variant="outline"
          size="page"
          onClick={() => setIsManualInputOpen(true)}
          title="粘贴一份「姓名 部门 职位」名单，只为这次做台卡"
        >
          <FileText className="h-4 w-4" />
          粘贴名单
        </Button>
        {uploadedUsers && (
          <span className="text-xs text-zinc-400">当前名单为粘贴内容，非员工档案</span>
        )}
        <Button variant="outline" size="page" onClick={() => setIsParticipantModalOpen(true)}>
          <Users className="h-4 w-4" />
          选择人员 ({selectedUserIds.size})
        </Button>
        <Button size="page" onClick={handlePrint} disabled={selectedUserIds.size === 0}>
          <Printer className="h-4 w-4" />
          打印台卡
        </Button>
      </div>
    </div>
  );
}
