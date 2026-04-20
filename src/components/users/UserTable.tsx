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
import { User } from '../../types';
import { useUserStore } from '../../store/useUserStore';
import { Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Users } from 'lucide-react';
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
          const idCard = row.original.idCard || '';
          const gender = idCard && idCard.length === 18 ? (parseInt(idCard.charAt(16)) % 2 === 0 ? '女' : '男') : '-';
          let age: number | string = '-';
          if (idCard && idCard.length === 18) {
            const year = parseInt(idCard.substring(6, 10));
            const month = parseInt(idCard.substring(10, 12));
            const day = parseInt(idCard.substring(12, 14));
            const today = new Date();
            age = today.getFullYear() - year;
            if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
          }
          return (
            <div className="text-zinc-900 dark:text-zinc-200">
              {gender} / {age}
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
          const contractExpiry = row.original.contractExpiry;
          let daysToExpiry: number | string = '-';
          if (contractExpiry) {
            const expiry = new Date(contractExpiry);
            const today = new Date();
            const diffTime = expiry.getTime() - today.getTime();
            daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }
          return <div className="text-zinc-900 dark:text-zinc-200">{daysToExpiry}</div>;
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

  if (isLoading) {
    return (
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[800px] text-left border-collapse">
          <caption className="sr-only">员工列表加载中</caption>
          <thead>
            <tr>
              {table.getFlatHeaders().map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-6 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800"
                  style={{ width: header.getSize() }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
            <TableSkeleton columns={columns.length} rows={10} />
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <EmptyState title="未找到员工" description="请尝试调整搜索条件或添加新员工" icon={Users} />
      </div>
    );
  }

  return (
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
  );
});
