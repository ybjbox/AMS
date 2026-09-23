import React, { useRef, useState } from 'react';
import { ArrowDownToLine, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Table } from '../hooks/useSeatingArrange';
import type { MoveSpec } from '../lib/manual';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  onRename: (from: number, to: number) => void;
}

/** 拖拽悬停时的落点：某个成员之前，或桌尾 */
type DropHint = string | null;

export function TableCard({ table, viewMode, capacity, pickedUserId, onPick, onMove, onRemove, onRename }: TableCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [hint, setHint] = useState<DropHint>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftNumber, setDraftNumber] = useState(String(table.number));
  const committed = useRef(true);

  const full = Number.isFinite(capacity) && table.members.length >= (capacity ?? Infinity);
  const canMoveIn = pickedUserId !== null && !table.members.some((m) => m.id === pickedUserId);

  const clearDragState = () => {
    setDragOver(false);
    setHint(null);
  };

  const dropHandler = (beforeMemberId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    clearDragState();
    const userId = e.dataTransfer.getData('text/plain');
    if (userId) onMove({ userId, toTable: table.number, beforeMemberId });
  };

  const commitRename = () => {
    // Enter 提交后往往还会跟一次 blur（元素被换掉前），用一次性标记避免重复改名
    if (committed.current) return;
    committed.current = true;
    setEditingName(false);
    const to = parseInt(draftNumber.trim(), 10);
    if (Number.isFinite(to) && to !== table.number) onRename(table.number, to);
  };

  return (
    <div
      onDragOver={(e) => {
        // 指针停在某个成员上时由该成员决定落点，这里只处理「落在桌面＝追加桌尾」
        if ((e.target as HTMLElement).closest('[data-member-id]')) return;
        e.preventDefault();
        setDragOver(true);
        setHint('tail');
      }}
      onDragLeave={(e) => {
        if ((e.relatedTarget as HTMLElement | null)?.closest('[data-table-number]')) return;
        clearDragState();
      }}
      onDrop={dropHandler(null)}
      onDragEnd={clearDragState}
      className={[
        'bg-white dark:bg-zinc-800 shadow-sm border rounded-xl overflow-hidden flex flex-col transition-colors',
        dragOver
          ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900/60'
          : 'border-zinc-200/60 dark:border-zinc-700/60',
      ].join(' ')}
      data-table-number={table.number}
    >
      <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-b from-brand-600 to-brand-700 shadow-inner dark:bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
            {table.number}
          </div>
          {editingName ? (
            <Input
              autoFocus
              type="number"
              min={1}
              max={999}
              value={draftNumber}
              aria-label="新桌号"
              onChange={(e) => setDraftNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  committed.current = true;
                  setEditingName(false);
                }
              }}
              onBlur={commitRename}
              className="w-24 px-2 text-center"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftNumber(String(table.number));
                setEditingName(true);
                committed.current = false;
              }}
              title="修改桌号"
              aria-label={`修改 ${table.number} 号桌的桌号`}
              className="group/name flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors"
            >
              <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{table.number}号桌</h3>
              <Pencil className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover/name:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2 shrink-0">
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
          <p className="text-sm text-muted-foreground py-6 text-center">空桌 —— 把人拖进来，或先点选一个人再回来</p>
        )}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2'}>
          {table.members.map((m, idx) => (
            <MemberChip
              key={m.id}
              member={m}
              seat={idx + 1}
              picked={pickedUserId === m.id}
              insertBefore={hint === m.id}
              onPick={onPick}
              onHint={() => setHint(m.id)}
              onDropBefore={(e) => dropHandler(m.id)(e)}
              onMove={onMove}
              showChevron={viewMode === 'list'}
            />
          ))}
          {hint === 'tail' && (
            <div
              data-drop-tail
              className="h-[53px] rounded-lg border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-900/15 flex items-center justify-center text-xs text-brand-700 dark:text-brand-300"
            >
              松手落座桌尾
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberChip({
  member,
  seat,
  picked,
  insertBefore,
  showChevron,
  onPick,
  onHint,
  onDropBefore,
  onMove,
}: {
  member: Table['members'][number];
  seat: number;
  picked: boolean;
  insertBefore: boolean;
  showChevron?: boolean;
  onPick: (userId: string | null) => void;
  onHint: () => void;
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
      onDragOver={(e) => {
        e.preventDefault();
        onHint();
      }}
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
        'relative group flex items-center justify-between gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors',
        insertBefore && 'before:absolute before:-top-2 before:left-0 before:right-0 before:h-0.5 before:rounded-full before:bg-brand-500 before:content-[""]',
        picked
          ? 'bg-brand-50 dark:bg-brand-900/25 border-brand-300 dark:border-brand-700 ring-2 ring-brand-200 dark:ring-brand-900/60'
          : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-700 hover:border-zinc-200 dark:hover:border-zinc-600',
      ].join(' ')}
      data-member-id={member.id}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground w-4 shrink-0 tabular-nums">{seat}.</span>
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
          className="p-1 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
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
