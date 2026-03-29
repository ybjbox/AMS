import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
  ColumnDef,
  ColumnResizeMode,
} from '@tanstack/react-table';
import { User, Permission } from '../../types';
import { useAuth } from '../../store/auth';
import { Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { TableSkeleton } from '../ui/Skeleton';

interface UserTableProps {
  data: User[];
  isLoading: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onRowClick?: (user: User) => void;
}

export function UserTable({ data, isLoading, onEdit, onDelete, onRowClick }: UserTableProps) {
  const hasPermission = useAuth(state => state.hasPermission);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');

  const columns = useMemo<ColumnDef<User>[]>(() => {
    const baseColumns: ColumnDef<User>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <div
              className="flex items-center cursor-pointer select-none"
              onClick={column.getToggleSortingHandler()}
            >
              姓名/工号
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-slate-900 dark:text-white">
              {row.original.name}
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              {row.original.id}
            </div>
          </div>
        ),
        size: 150,
        minSize: 100,
      },
      {
        accessorKey: 'department',
        header: ({ column }) => {
          return (
            <div
              className="flex items-center cursor-pointer select-none"
              onClick={column.getToggleSortingHandler()}
            >
              部门/职位
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => (
          <div>
            <div className="text-slate-900 dark:text-slate-200">
              {row.original.department || '-'}
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              {row.original.role || '-'}
            </div>
          </div>
        ),
        size: 180,
        minSize: 120,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => {
          return (
            <div
              className="flex items-center cursor-pointer select-none"
              onClick={column.getToggleSortingHandler()}
            >
              状态
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100" />
              )}
            </div>
          );
        },
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                status === '在职'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : status === '试用期'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
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
        cell: ({ row }) => (
          <div className="text-slate-900 dark:text-slate-200">
            {row.original.phone || '-'}
          </div>
        ),
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
            <div className="text-slate-900 dark:text-slate-200">
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
              <div className="text-slate-900 dark:text-slate-200">
                {joinDate || '-'}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                {yearsOfService}
              </div>
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
          <div className="text-slate-900 dark:text-slate-200">
            {row.original.employmentType || '-'}
          </div>
        ),
        size: 100,
        minSize: 80,
      },
      {
        accessorKey: 'contractExpiry',
        header: ({ column }) => {
          return (
            <div
              className="flex items-center cursor-pointer select-none"
              onClick={column.getToggleSortingHandler()}
            >
              合同到期(天)
              {{
                asc: <ArrowUp className="ml-2 h-4 w-4" />,
                desc: <ArrowDown className="ml-2 h-4 w-4" />,
              }[column.getIsSorted() as string] ?? (
                <ArrowUpDown className="ml-2 h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100" />
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
          return (
            <div className="text-slate-900 dark:text-slate-200">
              {daysToExpiry}
            </div>
          );
        },
        size: 130,
        minSize: 100,
      },
    ];

    if (hasPermission(Permission.MANAGE_USERS)) {
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
              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors"
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

  if (isLoading) {
    return (
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {table.getFlatHeaders().map((header) => (
                <th
                  key={header.id}
                  className="px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700"
                  style={{ width: header.getSize() }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            <TableSkeleton columns={columns.length} rows={10} />
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
          <Search className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">未找到员工</h3>
        <p className="text-slate-500 dark:text-slate-400">请尝试调整搜索条件或添加新员工</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto relative">
      <table
        className="w-full text-left border-collapse"
        style={{ width: table.getTotalSize() }}
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header, index) => {
                const isFirst = index === 0;
                const isLast = index === headerGroup.headers.length - 1;
                return (
                  <th
                    key={header.id}
                    className={`group px-6 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 relative ${
                      isFirst ? 'sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]' : ''
                    } ${
                      isLast ? 'sticky right-0 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)]' : ''
                    }`}
                    style={{
                      width: header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-slate-300 dark:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity ${
                          header.column.getIsResizing() ? 'opacity-100 bg-blue-500' : ''
                        }`}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group/row ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick && onRowClick(row.original)}
            >
              {row.getVisibleCells().map((cell, index) => {
                const isFirst = index === 0;
                const isLast = index === row.getVisibleCells().length - 1;
                return (
                  <td
                    key={cell.id}
                    className={`px-6 py-4 whitespace-nowrap text-sm bg-white dark:bg-slate-800 group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-700/50 transition-colors ${
                      isFirst ? 'sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]' : ''
                    } ${
                      isLast ? 'sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)] text-right' : ''
                    }`}
                    style={{
                      width: cell.column.getSize(),
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
