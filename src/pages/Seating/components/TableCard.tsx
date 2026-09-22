import React, { useState } from 'react';
import { ArrowDownToLine, ChevronRight, Trash2 } from 'lucide-react';
import { Table } from '../hooks/useSeatingArrange';
import type { MoveSpec } from '../lib/manual';
import { Button } from '@/components/ui/button';

interface TableCardProps {
  table: Table;
  viewMode: 'grid' | 'list';
  /** 该桌人数上限；缺省按不限处理 */
  capacity?: number;
  /** 当前被点选、等待移入某桌的人 */
  pickedUserId: string | null;
  onPick: (userId: string | null) => void;
  onMove: (spec: MoveSpec) => void;
  onRemove: (tableNumber: number) => void;
}

export function TableCard({ table, viewMode, capacity, pickedUserId, onPick, onMove, onRemove }: TableCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const full = Number.isFinite(capacity) && table.members.length >= (capacity ?? Infinity);
  const canMoveIn = pickedUserId !== null && !table.members.some((m) => m.id === pickedUserId);

  const dropHandler = (beforeMemberId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const userId = e.dataTransfer.getData('text/plain');
    if (userId) onMove({ userId, toTable: table.number, beforeMemberId });
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={dropHandler(null)}
      className={[
        'bg-white dark:bg-zinc-800 shadow-sm border rounded-xl overflow-hidden flex flex-col transition-colors',
        dragOver
          ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900/60'
          : 'border-zinc-200/60 dark:border-zinc-700/60',
      ].join(' ')}
      data-table-number={table.number}
    >
      <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-b from-brand-600 to-brand-700 shadow-inner dark:bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {table.number}
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-white">{table.number}号桌</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span
            className={[
              'text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap',
              full
                ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60'
                : 'text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600',
            ].join(' ')}
          >
            {table.members.length}
            {Number.isFinite(capacity) ? ` / ${capacity}` : ''} 人
          </span>
          {canMoveIn && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => pickedUserId && onMove({ userId: pickedUserId, toTable: table.number })}
              title="把已选中的人移入此桌"
              aria-label={`把已选中的人移入 ${table.number} 号桌`}
              className="text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20"
            >
              <ArrowDownToLine className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(table.number)}
            title="删除此桌（成员回到未入座）"
            aria-label={`删除 ${table.number} 号桌`}
            className="text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:text-zinc-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="p-4 flex-1">
        {table.members.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 py-6 text-center">空桌 —— 把人拖进来，或先点选一个人再回来</p>
        )}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {table.members.map((m, idx) => (
              <MemberChip
                key={m.id}
                member={m}
                seat={idx + 1}
                picked={pickedUserId === m.id}
                onPick={onPick}
                onDropBefore={(e) => dropHandler(m.id)(e)}
                onMove={onMove}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {table.members.map((m, idx) => (
              <MemberChip
                key={m.id}
                member={m}
                seat={idx + 1}
                picked={pickedUserId === m.id}
                onPick={onPick}
                onDropBefore={(e) => dropHandler(m.id)(e)}
                onMove={onMove}
                showChevron
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberChip({
  member,
  seat,
  picked,
  showChevron,
  onPick,
  onDropBefore,
  onMove,
}: {
  member: Table['members'][number];
  seat: number;
  picked: boolean;
  showChevron?: boolean;
  onPick: (userId: string | null) => void;
  onDropBefore: (e: React.DragEvent) => void;
  onMove: (spec: MoveSpec) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', member.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDropBefore(e);
      }}
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      aria-label={`${seat} 号 ${member.name}，${member.department} ${member.role}。回车后点目标桌即可移入`}
      onClick={() => onPick(picked ? null : member.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(picked ? null : member.id);
        }
      }}
      className={[
        'group flex items-center justify-between gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors',
        picked
          ? 'bg-brand-50 dark:bg-brand-900/25 border-brand-300 dark:border-brand-700 ring-2 ring-brand-200 dark:ring-brand-900/60'
          : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-700 hover:border-zinc-200 dark:hover:border-zinc-600',
      ].join(' ')}
      data-member-id={member.id}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-zinc-400 dark:text-zinc-500 w-4 shrink-0 tabular-nums">{seat}.</span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">{member.name}</div>
          <div className="text-3xs text-zinc-500 dark:text-zinc-400 truncate">
            {member.department} · {member.role}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMove({ userId: member.id, toTable: null });
          }}
          title="移出座位（回到未入座）"
          aria-label={`把 ${member.name} 移出座位`}
          className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {showChevron && (
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}
