import React from 'react';
import { Trash2, ChevronRight } from 'lucide-react';
import { Table } from '../hooks/useSeatingArrange';

interface TableCardProps {
  table: Table;
  viewMode: 'grid' | 'list';
  onRemove: (tableNumber: number) => void;
}

export function TableCard({ table, viewMode, onRemove }: TableCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner dark:bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {table.number}
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{table.number}号桌</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-600">
            {table.members.length} 人
          </span>
          <button
            onClick={() => onRemove(table.number)}
            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            title="删除此桌"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {table.members.map((m) => (
              <div key={m.id} className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{m.name}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{m.department} · {m.role}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {table.members.map((m, idx) => (
              <div key={m.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors group">
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-slate-400 dark:text-slate-500 w-4">{idx + 1}.</span>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{m.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{m.department} · {m.role}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
