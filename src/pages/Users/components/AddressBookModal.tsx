import React, { useCallback } from 'react';
import { Printer, Check, GripVertical } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { ExportColumn, TABLE_STYLE, TD_DEPT_STYLE, DEPT_COUNT_STYLE, TD_CENTER_STYLE } from '../constants';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableColumnProps {
  key?: React.Key;
  col: ExportColumn;
  onToggle: () => void;
}

const SortableColumn = React.memo(function SortableColumn({ col, onToggle }: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.key as string,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-3 rounded-xl border transition-all ${
        col.selected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 shadow-sm'
          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="mr-3 cursor-grab active:cursor-grabbing p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-400 dark:text-zinc-500"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <button onClick={onToggle} className="flex-1 flex items-center text-left">
        <div
          className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-colors ${
            col.selected
              ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner border-blue-600'
              : 'bg-white dark:bg-zinc-800 border-zinc-200/80 dark:border-zinc-600'
          }`}
        >
          {col.selected && <Check className="h-3 w-3 text-white" />}
        </div>
        <span className="text-sm font-medium">{col.label}</span>
      </button>
    </div>
  );
});

export interface AddressBookConfig {
  title: string;
  includeResigned: boolean;
  paperSize: string;
  orientation: string;
  isDoubleSided: boolean;
  isTwoColumn: boolean;
  mergeDepartments: boolean;
  columns: ExportColumn[];
}

interface AddressBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  addressBookConfig: AddressBookConfig;
  setAddressBookConfig: React.Dispatch<React.SetStateAction<AddressBookConfig>>;
  handlePrintAddressBook: () => void;
  processedAddressBookUsers: User[];
  previewLeft: User[];
  previewRight: User[];
}

export function AddressBookModal({
  isOpen,
  onClose,
  addressBookConfig,
  setAddressBookConfig,
  handlePrintAddressBook,
  processedAddressBookUsers,
  previewLeft,
  previewRight,
}: AddressBookModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddressBookDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setAddressBookConfig((prev: AddressBookConfig) => {
          const oldIndex = prev.columns.findIndex((col: ExportColumn) => col.key === active.id);
          const newIndex = prev.columns.findIndex((col: ExportColumn) => col.key === over.id);

          return {
            ...prev,
            columns: arrayMove(prev.columns, oldIndex, newIndex),
          };
        });
      }
    },
    [setAddressBookConfig]
  );

  const renderTableContent = useCallback(
    (usersData: (User & { _deptSpan?: number; _deptCount?: number })[], config: typeof addressBookConfig) => {
      const selectedCols = config.columns.filter((c: ExportColumn) => c.selected);
      return (
        <table className="w-full border-collapse text-sm" style={TABLE_STYLE}>
          <thead>
            <tr>
              {selectedCols.map((col: ExportColumn) => (
                <th
                  key={col.key as string}
                  className="border border-zinc-200 dark:border-zinc-700/80 px-3 py-2 bg-zinc-50 text-center font-semibold text-zinc-700 dark:text-zinc-300"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersData.map((user, idx) => (
              <tr key={user.id || idx}>
                {selectedCols.map((col: ExportColumn) => {
                  if (col.key === 'department' && config.mergeDepartments) {
                    if (user._deptSpan === 0) return null;
                    return (
                      <td
                        key={col.key as string}
                        rowSpan={user._deptSpan}
                        className="border border-zinc-200 dark:border-zinc-700/80 px-3 py-2 text-zinc-600 text-center align-middle font-medium bg-zinc-50/50"
                        style={TD_DEPT_STYLE}
                      >
                        {(user as unknown as Record<string, unknown>)[col.key as string] as string || '-'}
                        <div className="text-xs text-zinc-400 mt-0.5" style={DEPT_COUNT_STYLE}>
                          ({user._deptCount}人)
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.key as string}
                      className="border border-zinc-200 dark:border-zinc-700/80 px-3 py-2 text-zinc-600 text-center"
                      style={TD_CENTER_STYLE}
                    >
                      {(user as unknown as Record<string, unknown>)[col.key as string] as string || '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
    []
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="导出通讯录"
      size="full"
      footer={
        <>
          <button
            onClick={onClose}
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <button
            onClick={handlePrintAddressBook}
            disabled={addressBookConfig.columns.filter((c: ExportColumn) => c.selected).length === 0}
            className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="h-4 w-4 mr-2" />
            打印通讯录
          </button>
        </>
      }
    >
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row h-full">
        <div className="w-full md:w-1/3 p-6 space-y-6 overflow-y-auto border-r border-zinc-100 dark:border-zinc-700 h-full bg-white dark:bg-zinc-800">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">通讯录大标题</label>
            <input
              type="text"
              value={addressBookConfig.title}
              onChange={(e) => setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-zinc-200/80 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200 outline-none bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
              placeholder="请输入通讯录标题"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={addressBookConfig.includeResigned}
                    onChange={(e) =>
                      setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, includeResigned: e.target.checked }))
                    }
                  />
                  <div
                    className={`block w-10 h-6 rounded-full transition-colors ${addressBookConfig.includeResigned ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  ></div>
                  <div
                    className={`absolute left-1 top-1 bg-white dark:bg-zinc-800 w-4 h-4 rounded-full transition-transform ${addressBookConfig.includeResigned ? 'translate-x-4' : ''}`}
                  ></div>
                </div>
                <span className="ml-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">包含离职人员</span>
              </label>
            </div>
          </div>

          <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-700">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">打印设置</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">纸张大小</label>
                <Select
                  value={addressBookConfig.paperSize}
                  onValueChange={(val) => setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, paperSize: val || 'A4' }))}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                    <SelectValue placeholder="选择纸张大小" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A3">A3</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">纸张方向</label>
                <Select
                  value={addressBookConfig.orientation}
                  onValueChange={(val) => setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, orientation: val || 'portrait' }))}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                    <SelectValue placeholder="选择纸张方向">
                      {(val) => (val === 'portrait' ? '纵向' : val === 'landscape' ? '横向' : '选择纸张方向')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">纵向</SelectItem>
                    <SelectItem value="landscape">横向</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={addressBookConfig.isDoubleSided}
                    onChange={(e) =>
                      setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, isDoubleSided: e.target.checked }))
                    }
                  />
                  <div
                    className={`block w-8 h-5 rounded-full transition-colors ${addressBookConfig.isDoubleSided ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  ></div>
                  <div
                    className={`absolute left-0.5 top-0.5 bg-white dark:bg-zinc-800 w-4 h-4 rounded-full transition-transform ${addressBookConfig.isDoubleSided ? 'translate-x-3' : ''}`}
                  ></div>
                </div>
                <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">双面打印 (预留装订边距)</span>
              </label>
            </div>
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={addressBookConfig.isTwoColumn}
                    onChange={(e) => setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, isTwoColumn: e.target.checked }))}
                  />
                  <div
                    className={`block w-8 h-5 rounded-full transition-colors ${addressBookConfig.isTwoColumn ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  ></div>
                  <div
                    className={`absolute left-0.5 top-0.5 bg-white dark:bg-zinc-800 w-4 h-4 rounded-full transition-transform ${addressBookConfig.isTwoColumn ? 'translate-x-3' : ''}`}
                  ></div>
                </div>
                <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">双栏排版 (适合字段较少)</span>
              </label>
            </div>
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={addressBookConfig.mergeDepartments}
                    onChange={(e) =>
                      setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, mergeDepartments: e.target.checked }))
                    }
                  />
                  <div
                    className={`block w-8 h-5 rounded-full transition-colors ${addressBookConfig.mergeDepartments ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  ></div>
                  <div
                    className={`absolute left-0.5 top-0.5 bg-white dark:bg-zinc-800 w-4 h-4 rounded-full transition-transform ${addressBookConfig.mergeDepartments ? 'translate-x-3' : ''}`}
                  ></div>
                </div>
                <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">按部门合并并统计人数</span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">选择并排序导出列</label>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 rounded-full">
                拖拽左侧图标进行排序
              </span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAddressBookDragEnd}>
              <SortableContext
                items={addressBookConfig.columns.map((c: ExportColumn) => c.key as string)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {addressBookConfig.columns.map((col: ExportColumn, idx: number) => {
                    return (
                      <SortableColumn
                        key={col.key}
                        col={col}
                        onToggle={() => {
                          const newCols = [...addressBookConfig.columns];
                          newCols[idx].selected = !newCols[idx].selected;
                          setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, columns: newCols }));
                        }}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <div className="w-full md:w-2/3 flex flex-col items-center bg-zinc-100 dark:bg-zinc-900 p-6 overflow-auto relative min-h-[400px] h-full">
          <div className="sticky top-0 self-start text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-zinc-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-6 -ml-6 mb-4">
            打印预览
          </div>
          <div className="w-full bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{addressBookConfig.title}</h1>
            </div>
            <div className={`flex ${addressBookConfig.isTwoColumn ? 'gap-6' : ''} items-start`}>
              <div className="flex-1">{renderTableContent(previewLeft, addressBookConfig)}</div>
              {addressBookConfig.isTwoColumn && (
                <div className="flex-1">{renderTableContent(previewRight, addressBookConfig)}</div>
              )}
            </div>
            {processedAddressBookUsers.length > 20 && (
              <div className="text-center py-4 text-sm text-zinc-500 dark:text-zinc-400">
                ... 仅显示前 20 条预览数据，共 {processedAddressBookUsers.length} 条 ...
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
