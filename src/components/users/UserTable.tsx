import React, { useState, useMemo, useRef, memo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
  ColumnDef,
  ColumnResizeMode,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User } from '@/types';
import { useUserStore } from '@/store/useUserStore';
import { Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Users, Phone, Briefcase, Building2 } from 'lucide-react';
import { TableSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';

interface UserTableProps {
  data: User[];
  isLoading: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onRowClick?: (user: User) => void;
}

export const UserTable = memo(function UserTable({ data, isLoading, onEdit, onDelete, onRowClick }: UserTableProps) {
  const hasPermission = useUserStore((state) => state.hasPermission);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');

  const columns = useMemo<ColumnDef<User>[]>(() => {
    const baseColumns: ColumnDef<User>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <div className="flex items-center cursor-pointer select-none" onClick={column.getToggleSortingHandler()}>
              姓名/工号
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-zinc-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-zinc-900 dark:text-white">{row.original.name}</div>
            <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">{row.original.id}</div>
          </div>
        ),
        size: 150,
        minSize: 100,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => {
          return (
            <div className="flex items-center cursor-pointer select-none" onClick={column.getToggleSortingHandler()}>
              部门/职位
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-zinc-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => (
          <div>
            <div className="text-zinc-900 dark:text-zinc-200">{row.original.department || '-'}</div>
            <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">{row.original.role || '-'}</div>
          </div>
        ),
        size: 180,
        minSize: 120,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => {
          return (
            <div className="flex items-center cursor-pointer select-none" onClick={column.getToggleSortingHandler()}>
              状态
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-zinc-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                status === '在职'
                  ? 'bg-success/10 text-success'
                  : status === '试用期'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {status}
            </span>
          );
        },
        size: 100,
        minSize: 80,
      },
      {
        accessorKey: 'phone',
        header: '联系电话',
        cell: ({ row }) => <div className="text-zinc-900 dark:text-zinc-200">{row.original.phone || '-'}</div>,
        size: 130,
        minSize: 100,
      },
      {
        id: 'genderAge',
        header: '性别/年龄',
        cell: ({ row }) => {
          return (
            <div className="text-zinc-900 dark:text-zinc-200">
              {row.original.gender} / {row.original.age}
            </div>
          );
        },
        size: 100,
        minSize: 80,
      },
      {
        id: 'joinDateYears',
        header: '入职时间/工龄',
        cell: ({ row }) => {
          const joinDate = row.original.joinDate;
          let yearsOfService = '-';
          if (joinDate) {
            const join = new Date(joinDate);
            const today = new Date();
            let years = today.getFullYear() - join.getFullYear();
            let months = today.getMonth() - join.getMonth();
            if (months < 0 || (months === 0 && today.getDate() < join.getDate())) {
              years--;
              months += 12;
            }
            yearsOfService = `${years}年${months}个月`;
          }
          return (
            <div>
              <div className="text-zinc-900 dark:text-zinc-200">{joinDate || '-'}</div>
              <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">{yearsOfService}</div>
            </div>
          );
        },
        size: 150,
        minSize: 120,
      },
      {
        accessorKey: 'employmentType',
        header: '用工形式',
        cell: ({ row }) => (
          <div className="text-zinc-900 dark:text-zinc-200">{row.original.employmentType || '-'}</div>
        ),
        size: 100,
        minSize: 80,
      },
      {
        accessorKey: 'contractExpiry',
        header: ({ column }) => {
          return (
            <div className="flex items-center cursor-pointer select-none" onClick={column.getToggleSortingHandler()}>
              合同到期(天)
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-zinc-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => {
          return <div className="text-zinc-900 dark:text-zinc-200">{row.original.daysToExpiry}</div>;
        },
        size: 130,
        minSize: 100,
      },
    ];

    if (hasPermission('users:manage')) {
      baseColumns.push({
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(row.original);
              }}
              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              title="编辑"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.original);
              }}
              className="text-destructive hover:text-destructive/80 transition-colors"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
        size: 100,
        minSize: 80,
        enableSorting: false,
        enableResizing: false,
      });
    }

    return baseColumns;
  }, [hasPermission, onEdit, onDelete]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {isLoading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        <div className="text-center py-12">
          <EmptyState title="未找到员工" description="请尝试调整搜索条件或添加新员工" icon={Users} />
        </div>
      ) : (
        <>
          {/* 移动端卡片视图（< md） */}
          <div className="md:hidden flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-700/50">
            {data.map((user) => (
              <div
                key={user.id}
                className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors cursor-pointer"
                onClick={() => onRowClick?.(user)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-white text-sm">{user.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{user.id}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user.status === '在职'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : user.status === '试用期'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                  }`}>
                    {user.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  {user.department && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />{user.department}
                    </span>
                  )}
                  {user.role && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />{user.role}
                    </span>
                  )}
                  {user.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />{user.phone}
                    </span>
                  )}
                </div>
                {hasPermission('users:manage') && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(user); }}
                      className="flex-1 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(user); }}
                      className="flex-1 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 桌面端虚拟化表格（>= md），原有代码保持不变 */}
          <div className="hidden md:flex flex-1 flex-col min-h-0">
            <div ref={parentRef} className="w-full h-full overflow-x-auto overflow-y-auto relative">
              <table className="w-full min-w-[800px] text-left border-collapse relative" style={{ width: table.getTotalSize() }} aria-label="员工列表">
                <caption className="sr-only">员工列表</caption>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header, index) => {
                        const isFirst = index === 0;
                        const isLast = index === headerGroup.headers.length - 1;
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={
                              header.column.getIsSorted() === 'asc'
                                ? 'ascending'
                                : header.column.getIsSorted() === 'desc'
                                ? 'descending'
                                : undefined
                            }
                            className={`group px-6 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 z-20 ${
                              isFirst
                                ? 'left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]'
                                : ''
                            } ${
                              isLast
                                ? 'right-0 z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)]'
                                : ''
                            }`}
                            style={{
                              width: header.getSize(),
                            }}
                          >
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanResize() && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-zinc-300 dark:bg-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ${
                                  header.column.getIsResizing() ? 'opacity-100 bg-blue-600' : ''
                                }`}
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
                  {paddingTop > 0 && (
                    <tr>
                      <td colSpan={columns.length} style={{ height: `${paddingTop}px`, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                  {virtualItems.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                      <tr
                        key={row.id}
                        data-index={virtualRow.index}
                        className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors group/row w-full ${onRowClick ? 'cursor-pointer' : ''}`}
                        onClick={() => onRowClick && onRowClick(row.original)}
                      >
                        {row.getVisibleCells().map((cell, index) => {
                          const isFirst = index === 0;
                          const isLast = index === row.getVisibleCells().length - 1;
                          return (
                            <td
                              key={cell.id}
                              className={`px-6 whitespace-nowrap text-sm bg-white dark:bg-zinc-800 group-hover/row:bg-zinc-50/80 dark:group-hover/row:bg-zinc-700/30 transition-colors ${
                                isFirst
                                  ? 'sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]'
                                  : ''
                              } ${
                                isLast
                                  ? 'sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)]'
                                  : ''
                              } border-b border-zinc-50 dark:border-zinc-800/50`}
                              style={{
                                width: cell.column.getSize(),
                                minWidth: cell.column.getSize(),
                                height: '52px',
                              }}
                            >
                              <div className={`flex items-center h-full ${isLast ? 'justify-end' : ''}`}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td colSpan={columns.length} style={{ height: `${paddingBottom}px`, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
