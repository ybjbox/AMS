import React, { useState } from 'react';
import { Armchair } from 'lucide-react';
import type { User } from '@/types';
import type { MoveSpec } from '../lib/manual';

interface UnseatedStripProps {
  users: User[];
  pickedUserId: string | null;
  onPick: (userId: string | null) => void;
  onMove: (spec: MoveSpec) => void;
}

/**
 * 未入座的人。排座过程中「先拿掉再另放」是常态，所以被拿掉的人必须留在视野里，
 * 否则会以为丢了人。拖到某桌即落座；把人拖回这里等于移出座位。
 */
export function UnseatedStrip({ users, pickedUserId, onPick, onMove }: UnseatedStripProps) {
  const [dragOver, setDragOver] = useState(false);

  if (users.length === 0) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const userId = e.dataTransfer.getData('text/plain');
        if (userId) onMove({ userId, toTable: null });
      }}
      className={[
        'rounded-xl border border-dashed px-4 py-3 transition-colors',
        dragOver
          ? 'border-brand-400 dark:border-brand-500 bg-brand-50/60 dark:bg-brand-900/15'
          : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/30',
      ].join(' ')}
      data-testid="unseated-strip"
    >
      <div className="flex items-center gap-2 mb-2">
        <Armchair className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">未入座 {users.length} 人</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">拖到某桌落座；先点选一人，再点目标桌的「移入」也可以</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', u.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => onPick(pickedUserId === u.id ? null : u.id)}
            aria-pressed={pickedUserId === u.id}
            title={`${u.department || '未分配部门'} · ${u.role || '未分配职位'}`}
            className={[
              'px-2.5 py-1 rounded-lg border text-sm cursor-grab active:cursor-grabbing transition-colors',
              pickedUserId === u.id
                ? 'bg-brand-50 dark:bg-brand-900/25 border-brand-300 dark:border-brand-700 text-brand-800 dark:text-brand-200'
                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-brand-300 dark:hover:border-brand-700',
            ].join(' ')}
          >
            {u.name}
          </button>
        ))}
      </div>
    </div>
  );
}
