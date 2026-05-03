import React from 'react';
import { User } from '@/types';
import { ExportColumn } from '../constants';
interface RosterPrintTemplateProps {
  printRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  columns: ExportColumn[];
  users: User[];
  includeResigned: boolean;
}
export function RosterPrintTemplate({
  printRef,
  title,
  columns,
  users,
  includeResigned,
}: RosterPrintTemplateProps) {
  const visibleColumns = columns.filter((c) => c.selected);
  const filteredUsers = users.filter((u) =>
    includeResigned ? true : u.status !== '离职'
  );
  return (
    <div className="hidden">
      <div ref={printRef}>
        <h1>{title}</h1>
        <table>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                {visibleColumns.map((col) => (
                  <td key={col.key}>
                    {(u as unknown as Record<string, unknown>)[col.key] as string || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
interface AddressBookPrintTemplateProps {
  printRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  columns: ExportColumn[];
  isTwoColumn: boolean;
  mergeDepartments: boolean;
  leftUsers: (User & { _deptSpan?: number; _deptCount?: number })[];
  rightUsers: (User & { _deptSpan?: number; _deptCount?: number })[];
}
function AddressBookTable({
  columns,
  users,
  mergeDepartments,
}: {
  columns: ExportColumn[];
  users: (User & { _deptSpan?: number; _deptCount?: number })[];
  mergeDepartments: boolean;
}) {
  const visibleColumns = columns.filter((c) => c.selected);
  return (
    <table className="w-full border-collapse text-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {visibleColumns.map((col) => (
            <th key={col.key} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left' }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {users.map((user, idx) => (
          <tr key={user.id || idx}>
            {visibleColumns.map((col) => {
              if (col.key === 'department' && mergeDepartments) {
                if (user._deptSpan === 0) return null;
                return (
                  <td
                    key={col.key}
                    rowSpan={user._deptSpan}
                    style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle' }}
                  >
                    {(user as unknown as Record<string, unknown>)[col.key] as string || '-'}
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      ({user._deptCount}人)
                    </div>
                  </td>
                );
              }
              return (
                <td key={col.key} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                  {(user as unknown as Record<string, unknown>)[col.key] as string || '-'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function AddressBookPrintTemplate({
  printRef,
  title,
  columns,
  isTwoColumn,
  mergeDepartments,
  leftUsers,
  rightUsers,
}: AddressBookPrintTemplateProps) {
  return (
    <div className="hidden">
      <div ref={printRef}>
        <h1>{title}</h1>
        <div className={isTwoColumn ? 'flex gap-5 items-start' : 'block'}>
          <div className="flex-1">
            <AddressBookTable columns={columns} users={leftUsers} mergeDepartments={mergeDepartments} />
          </div>
          {isTwoColumn && (
            <div className="flex-1">
              <AddressBookTable columns={columns} users={rightUsers} mergeDepartments={mergeDepartments} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
