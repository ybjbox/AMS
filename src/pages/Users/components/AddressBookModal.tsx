import React, { useCallback } from 'react';
import { Printer, Check, GripVertical } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PreviewZoomControl } from '@/components/PreviewZoomControl';
import { usePreviewZoom, zoomStyle } from '@/hooks/usePreviewZoom';
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
      className={`flex items-center p-3 rounded-xl border transition ${
        col.selected
          ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 shadow-sm'
          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="mr-3 cursor-grab active:cursor-grabbing p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-muted-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <button onClick={onToggle} className="flex-1 flex items-center text-left">
        <div
          className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-colors ${
            col.selected
              ? 'bg-gradient-to-b from-brand-600 to-brand-700 shadow-inner border-brand-600'
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
  const { zoom, change, reset } = usePreviewZoom('address-book');
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
                  className="border border-zinc-200 px-3 py-2 bg-zinc-50 text-center font-semibold text-zinc-700"
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
            <Input
              type="text"
              value={addressBookConfig.title}
              onChange={(e) => setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, title: e.target.value }))}
              placeholder="请输入通讯录标题"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center">
                <Checkbox
                  id="ab-include-resigned"
                  checked={addressBookConfig.includeResigned}
                  onCheckedChange={(checked) =>
                    setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, includeResigned: checked }))
                  }
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="ab-include-resigned" className="ml-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">包含离职人员</label>
              </div>
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
                  <SelectTrigger className="w-full">
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
                  items={[{ value: 'portrait', label: '纵向' }, { value: 'landscape', label: '横向' }]}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择纸张方向" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">纵向</SelectItem>
                    <SelectItem value="landscape">横向</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <Checkbox
                  id="ab-double-sided"
                  checked={addressBookConfig.isDoubleSided}
                  onCheckedChange={(checked) =>
                    setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, isDoubleSided: checked }))
                  }
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="ab-double-sided" className="ml-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">双面打印 (预留装订边距)</label>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <Checkbox
                  id="ab-two-column"
                  checked={addressBookConfig.isTwoColumn}
                  onCheckedChange={(checked) => setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, isTwoColumn: checked }))}
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="ab-two-column" className="ml-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">双栏排版 (适合字段较少)</label>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <Checkbox
                  id="ab-merge-depts"
                  checked={addressBookConfig.mergeDepartments}
                  onCheckedChange={(checked) =>
                    setAddressBookConfig((prev: AddressBookConfig) => ({ ...prev, mergeDepartments: checked }))
                  }
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="ab-merge-depts" className="ml-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">按部门合并并统计人数</label>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">选择并排序导出列</label>
              <span className="text-3xs text-muted-foreground bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 rounded-full">
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

        <div className="w-full md:w-2/3 flex flex-col items-center bg-zinc-100 dark:bg-zinc-900 px-6 pb-6 overflow-auto relative min-h-[400px] h-full">
          <div className="sticky top-0 z-10 -mx-6 mb-4 flex self-stretch items-center justify-between gap-3 bg-white/90 py-1.5 pl-3 pr-2 text-xs font-medium uppercase tracking-wider text-zinc-500 shadow-sm backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-400">
            <span>打印预览</span>
            <PreviewZoomControl zoom={zoom} onChange={change} onReset={reset} />
          </div>
          <div style={zoomStyle(zoom)} className="w-full bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl p-8">
            <div className="text-center mb-6">
              {/* 纸张标题：页面已有 h1，打印 HTML 由 builder 单独生成 */}
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{addressBookConfig.title}</h2>
            </div>
            <div className={`flex ${addressBookConfig.isTwoColumn ? 'gap-6' : ''} items-start`}>
              <div className="flex-1">{renderTableContent(previewLeft, addressBookConfig)}</div>
              {addressBookConfig.isTwoColumn && (
                <div className="flex-1">{renderTableContent(previewRight, addressBookConfig)}</div>
              )}
            </div>
            {processedAddressBookUsers.length > 20 && (
              <div className="text-center py-4 text-sm text-zinc-500 dark:text-zinc-400">
                … 仅显示前 20 条预览数据，共 {processedAddressBookUsers.length} 条 …
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
