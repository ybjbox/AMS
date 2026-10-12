import React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableCapacity } from '../hooks/useSeatingArrange';

interface TableConfigProps {
  tableCapacities: TableCapacity[];
  /** 画布上现有的桌：座位数只能按它算，见下方注释 */
  tables: Table[];
  /** 桌号 → 该桌容量（`capacitiesByNumber`） */
  capacities: Record<number, number>;
  addTableCapacity: () => void;
  updateTableCapacity: (id: string, value: number) => void;
  removeTableCapacity: (id: string) => void;
  skippedNumbers: string;
  setSkippedNumbers: (val: string) => void;
  selectedCount: number;
}

export function TableConfig({
  tableCapacities,
  tables,
  capacities,
  addTableCapacity,
  updateTableCapacity,
  removeTableCapacity,
  skippedNumbers,
  setSkippedNumbers,
  selectedCount,
}: TableConfigProps) {
  /**
   * 座位按**画布上现有的桌**算，不按容量配置行求和。
   *
   * 配置行是"计划"：删掉一桌（`removeTable`）只动画布、不会缩配置行，「清空」也是；
   * 求和于是会算进已经不存在的桌子 —— 按 40 席订餐、现场只排 32 桌就是这么来的。
   * 每桌至少要有坐进去的人那么多座位，所以取 `max(容量, 已坐人数)`。
   */
  const seats = tables.reduce((n, t) => n + Math.max(capacities[t.number] ?? 0, t.members.length), 0);
  const seated = tables.reduce((n, t) => n + t.members.length, 0);
  return (
    <div className="bg-white dark:bg-zinc-800 p-6 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">各桌人数设置</label>
            <button
              onClick={addTableCapacity}
              className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium flex items-center"
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
                <span className="text-xs text-muted-foreground px-2 font-medium whitespace-nowrap">
                  {tc.tableNumber}号桌
                </span>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  aria-label={`第 ${tc.tableNumber} 桌人数`}
                  value={tc.capacity}
                  onChange={(e) => updateTableCapacity(tc.id, parseInt(e.target.value) || 1)}
                  className="w-14 px-1 text-center"
                />
                {tableCapacities.length > 1 && (
                  <button
                    onClick={() => removeTableCapacity(tc.id)}
                    className="ml-1 p-1 text-muted-foreground hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
            <Input
              type="text"
              value={skippedNumbers}
              onChange={(e) => setSkippedNumbers(e.target.value)}
              placeholder="例如：4, 14, 24"
              aria-label="跳过桌号（用逗号分隔）"
              className="flex-1 max-w-xs"
            />
            <span className="text-xs text-muted-foreground">（用逗号分隔，如：4, 14）</span>
          </div>
        </div>
        <div className="flex items-center space-x-8 md:px-6 md:border-l border-zinc-100 dark:border-zinc-700 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0">
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">
              参与人数
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">{selectedCount}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">
              座位
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-white">{seats}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">
              已入座
            </div>
            <div
              className={`text-xl font-bold ${seated < selectedCount ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-900 dark:text-white'}`}
            >
              {seated}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
