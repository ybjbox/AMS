import React from 'react';
import { UserCog } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ProfilePanel() {
  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">个人设置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">管理您的个人资料与账号安全</p>
      </div>
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
        <EmptyState
          icon={UserCog}
          title="个人资料编辑"
          description="个人资料、头像上传与密码修改功能正在开发中，敬请期待"
          className="py-20"
        />
      </div>
    </div>
  );
}
