import { Pressable } from '@/components/ui/Pressable';
import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import Badge from '@/components/ui/Badge';
import { Table, TableFrame, TableHead, TableHeader, StickyCell } from '@/components/ui/Table';
import { expiryBucket } from '../utils/expiryBucket';
import { Eye, Printer, FileText } from 'lucide-react';

interface ContractTableProps {
  filteredUsers: User[];
  /** 员工名单没拉到时不能显示成"没有符合条件的记录"（审查 M1） */
  loadError?: string | null;
  onRetry?: () => void;
  onPreview: (user: User) => void;
  onDirectPrint: (user: User) => void;
}

export const ContractTable = ({ filteredUsers, loadError, onRetry, onPreview, onDirectPrint }: ContractTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredUsers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 61,
    overscan: 5,
  });

  return (
    <div className="relative flex-1 rounded-b-xl border-t border-zinc-200 dark:border-zinc-700 h-full min-h-0">
      <TableFrame ref={parentRef} className="h-full">
        <Table className="relative" minWidth="min-w-200" nowrapHeaders aria-label="合同列表">
          <TableHeader>
            <tr>
              <TableHead density="comfortable" sticky="left" scope="col">
                工号
              </TableHead>
              <TableHead density="comfortable" scope="col">
                姓名
              </TableHead>
              <TableHead density="comfortable" scope="col">
                部门
              </TableHead>
              <TableHead density="comfortable" scope="col">
                合同状态
              </TableHead>
              <TableHead density="comfortable" scope="col">
                签订日期
              </TableHead>
              <TableHead density="comfortable" scope="col">
                到期日期
              </TableHead>
              <TableHead density="comfortable" align="right" sticky="right" scope="col">
                操作
              </TableHead>
            </tr>
          </TableHeader>
          <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredUsers.length > 0 ? (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px`, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const user = filteredUsers[virtualRow.index];
                  // 分档判断只有 `utils/expiryBucket` 一份：徽章、顶部量级、点数字筛选
                  // 全走它，才不会出现"表格说 3 个过期、顶部说 2 个"。
                  const bucket = expiryBucket(user);

                  return (
                    <tr
                      key={user.id}
                      className="group w-full hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                    >
                      <StickyCell
                        side="left"
                        className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-700/50"
                      >
                        {user.id}
                      </StickyCell>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{user.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{user.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            bucket === 'expired'
                              ? 'destructive'
                              : bucket === 'soon'
                                ? 'warning'
                                : bucket === 'ok'
                                  ? 'primary'
                                  : 'neutral'
                          }
                        >
                          {bucket === 'expired'
                            ? '已过期'
                            : bucket === 'soon'
                              ? '即将到期'
                              : bucket === 'ok'
                                ? '正常'
                                : '未登记'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {user.contractSignDate || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {user.contractExpiry || '-'}
                        {bucket === 'soon' && (
                          <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                            ({user.daysToExpiry}天后)
                          </span>
                        )}
                      </td>
                      <StickyCell
                        side="right"
                        className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium bg-white dark:bg-zinc-800 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-700/50"
                      >
                        <div className="flex items-center justify-end space-x-3">
                          <Pressable
                            data-userid={user.id}
                            onClick={() => onPreview(user)}
                            className="text-brand-600 hover:text-brand-900 dark:text-brand-400 dark:hover:text-brand-300 flex items-center px-1.5 py-1 -my-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            预览
                          </Pressable>
                          <Pressable
                            data-userid={user.id}
                            onClick={() => onDirectPrint(user)}
                            className="text-brand-700 hover:text-brand-900 dark:text-brand-400 dark:hover:text-brand-300 flex items-center px-1.5 py-1 -my-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            打印
                          </Pressable>
                        </div>
                      </StickyCell>
                    </tr>
                  );
                })}
                {rowVirtualizer.getVirtualItems().length > 0 &&
                  rowVirtualizer.getTotalSize() -
                    rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end >
                    0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px`,
                          padding: 0,
                          border: 'none',
                        }}
                      />
                    </tr>
                  )}
              </>
            ) : (
              <tr>
                <td colSpan={7} className="p-0">
                  {loadError ? (
                    <FailedState subject="员工名单" reason={loadError} onRetry={onRetry} />
                  ) : (
                    <EmptyState
                      title="没有找到符合条件的员工记录"
                      description="请尝试调整搜索条件或筛选器"
                      icon={FileText}
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableFrame>
    </div>
  );
};
