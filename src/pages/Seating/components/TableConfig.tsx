import React from 'react';
import { X } from 'lucide-react';
import { TableCapacity } from '../hooks/useSeatingArrange';

interface TableConfigProps {
  tableCapacities: TableCapacity[];
  addTableCapacity: () => void;
  updateTableCapacity: (id: string, value: number) => void;
  removeTableCapacity: (id: string) => void;
  skippedNumbers: string;
  setSkippedNumbers: (val: string) => void;
  selectedCount: number;
}

export function TableConfig({
  tableCapacities,
  addTableCapacity,
  updateTableCapacity,
  removeTableCapacity,
  skippedNumbers,
  setSkippedNumbers,
  selectedCount,
}: TableConfigProps) {
  return (
    <div className="bg-white dark:bg-zinc-800 p-6 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">各桌人数设置</label>
            <button
              onClick={addTableCapacity}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center"
            >
              + 添加一桌
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {tableCapacities.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-1.5 shadow-sm"
              >
                <span className="text-xs text-zinc-500 dark:text-zinc-400 px-2 font-medium whitespace-nowrap">
                  {tc.tableNumber}号桌
                </span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={tc.capacity}
                  onChange={(e) => updateTableCapacity(tc.id, parseInt(e.target.value) || 1)}
                  className="w-14 border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 rounded shadow-sm py-1 px-1 text-sm focus:ring-1 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 text-center text-zinc-900 dark:text-white"
                />
                {tableCapacities.length > 1 && (
                  <button
                    onClick={() => removeTableCapacity(tc.id)}
                    className="ml-1 p-1 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center space-x-3">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
              跳过桌号：
            </label>
            <input
              type="text"
              value={skippedNumbers}
              onChange={(e) => setSkippedNumbers(e.target.value)}
              placeholder="例如：4, 14, 24"
              className="input-base flex-1 max-w-xs py-1.5"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">（用逗号分隔，如：4, 14）</span>
          </div>
        </div>
        <div className="flex items-center space-x-8 md:px-6 md:border-l border-zinc-100 dark:border-zinc-700 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0">
          <div className="text-center">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold mb-1">
              参与人数
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">{selectedCount}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold mb-1">
              总座位数
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">
              {tableCapacities.reduce((a, b) => a + b.capacity, 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
