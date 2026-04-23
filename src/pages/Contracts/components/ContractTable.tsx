import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { Eye, Printer, FileText } from 'lucide-react';

interface ContractTableProps {
  filteredUsers: User[];
  onPreview: (user: User) => void;
  onDirectPrint: (user: User) => void;
}

export const ContractTable = ({ filteredUsers, onPreview, onDirectPrint }: ContractTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredUsers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 61,
    overscan: 5,
  });

  return (
    <div className="relative flex-1 rounded-b-xl border-t border-zinc-200 dark:border-zinc-700 h-full min-h-0">
      <div ref={parentRef} className="h-full overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[800px] text-left border-collapse relative" aria-label="合同列表">
          <thead className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-20">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider relative z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] bg-zinc-50 dark:bg-zinc-900/50"
              >
                工号
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
              >
                姓名
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
              >
                部门
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
              >
                合同状态
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
              >
                签订日期
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
              >
                到期日期
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider relative z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)] bg-zinc-50 dark:bg-zinc-900/50"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredUsers.length > 0 ? (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
                  <tr>
                    <td colSpan={7} style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px`, padding: 0, border: 'none' }} />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const user = filteredUsers[virtualRow.index];
                  const daysToExpiry = user.daysToExpiry;
                  const isExpiringSoon = daysToExpiry <= 30 && daysToExpiry > 0;
                  const isExpired = daysToExpiry <= 0;

                  return (
                    <tr
                      key={user.id}
                      className="w-full hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-zinc-800 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-700/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                        {user.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {user.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isExpired
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : isExpiringSoon
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}
                        >
                          {isExpired ? '已过期' : isExpiringSoon ? '即将到期' : '正常'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {user.contractSignDate || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                        {user.contractExpiry || '-'}
                        {isExpiringSoon && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({daysToExpiry}天后)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 z-10 bg-white dark:bg-zinc-800 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-700/50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center justify-end space-x-3">
                          <button
                            data-userid={user.id}
                            onClick={() => onPreview(user)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            预览
                          </button>
                          <button
                            data-userid={user.id}
                            onClick={() => onDirectPrint(user)}
                            className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center"
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            打印
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end > 0 && (
                  <tr>
                    <td colSpan={7} style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px`, padding: 0, border: 'none' }} />
                  </tr>
                )}
              </>
            ) : (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    title="没有找到符合条件的员工记录"
                    description="请尝试调整搜索条件或筛选器"
                    icon={FileText}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
