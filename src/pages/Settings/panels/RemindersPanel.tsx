import React from 'react';
import { BellRing } from 'lucide-react';

export default function RemindersPanel() {
  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300">
      <div className="mb-6 shrink-0">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">提醒设置</h2>
        <p className="text-sm text-zinc-500 mt-1">配置试用期及合同到期的提前提醒天数</p>
      </div>
      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-center justify-center h-32">
        <div className="text-zinc-500 text-sm flex items-center">
          <BellRing className="w-5 h-5 mr-3 text-zinc-400" />
          <p>功能即将开发...</p>
        </div>
      </div>
    </div>
  );
}
