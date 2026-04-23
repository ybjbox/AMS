import React, { useCallback } from 'react';
import { Printer, Download, RefreshCw, Check, GripVertical, FileCode } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { ExportColumn, ExportTheme, ExportScript } from '../constants';
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

export interface ExportConfig {
  title: string;
  includeResigned: boolean;
  paperSize: string;
  orientation: string;
  isDoubleSided: boolean;
  mode: 'theme' | 'script';
  themeId: string;
  templateName: string;
  columns: ExportColumn[];
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportConfig: ExportConfig;
  setExportConfig: React.Dispatch<React.SetStateAction<ExportConfig>>;
  themes: Record<string, ExportTheme>;
  scripts: ExportScript[];
  isExporting: boolean;
  handleExport: (count: number) => void;
  handlePrintRoster: () => void;
  users: User[];
  filteredUsersLength: number;
}

export function ExportModal({
  isOpen,
  onClose,
  exportConfig,
  setExportConfig,
  themes,
  scripts,
  isExporting,
  handleExport,
  handlePrintRoster,
  users,
  filteredUsersLength,
}: ExportModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setExportConfig((prev: ExportConfig) => {
          const oldIndex = prev.columns.findIndex((col: ExportColumn) => col.key === active.id);
          const newIndex = prev.columns.findIndex((col: ExportColumn) => col.key === over.id);

          return {
            ...prev,
            columns: arrayMove(prev.columns, oldIndex, newIndex),
          };
        });
      }
    },
    [setExportConfig]
  );

  const onThemeSelect = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const themeId = e.currentTarget.dataset.id;
      if (themeId) {
        setExportConfig((prev: ExportConfig) => ({ ...prev, themeId }));
      }
    },
    [setExportConfig]
  );

  const onScriptSelect = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const templateName = e.currentTarget.dataset.name;
      if (templateName) {
        setExportConfig((prev: ExportConfig) => ({ ...prev, templateName }));
      }
    },
    [setExportConfig]
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="导出配置"
      size="full"
      footer={
        <>
          <button
            onClick={onClose}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
          >
            取消
          </button>
          <button
            onClick={handlePrintRoster}
            disabled={exportConfig.columns.filter((c: ExportColumn) => c.selected).length === 0}
            className="inline-flex items-center justify-center px-6 py-2 bg-white dark:bg-zinc-700 border border-zinc-200/80 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-all shadow-sm disabled:opacity-50"
          >
            <Printer className="h-4 w-4 mr-2" />
            打印
          </button>
          <button
            onClick={() => handleExport(filteredUsersLength)}
            disabled={isExporting || exportConfig.columns.filter((c: ExportColumn) => c.selected).length === 0}
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                确认导出
              </>
            )}
          </button>
        </>
      }
    >
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row h-full">
        <div className="w-full md:w-1/3 p-6 space-y-6 overflow-y-auto border-r border-zinc-100 dark:border-zinc-700 custom-scrollbar h-full">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">表格大标题</label>
            <input
              type="text"
              value={exportConfig.title}
              onChange={(e) => setExportConfig((prev: ExportConfig) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-zinc-200/80 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200 outline-none bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
              placeholder="请输入表格标题"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={exportConfig.includeResigned}
                    onChange={(e) => setExportConfig((prev: ExportConfig) => ({ ...prev, includeResigned: e.target.checked }))}
                  />
                  <div
                    className={`block w-10 h-6 rounded-full transition-colors ${exportConfig.includeResigned ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  ></div>
                  <div
                    className={`absolute left-1 top-1 bg-white dark:bg-zinc-800 w-4 h-4 rounded-full transition-transform ${exportConfig.includeResigned ? 'translate-x-4' : ''}`}
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
                  value={exportConfig.paperSize}
                  onValueChange={(val) => setExportConfig((prev: ExportConfig) => ({ ...prev, paperSize: val || 'A4' }))}
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
                  value={exportConfig.orientation}
                  onValueChange={(val) => setExportConfig((prev: ExportConfig) => ({ ...prev, orientation: val || 'portrait' }))}
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
                    checked={exportConfig.isDoubleSided}
                    onChange={(e) => setExportConfig((prev: ExportConfig) => ({ ...prev, isDoubleSided: e.target.checked }))}
                  />
                  <div
                    className={`block w-8 h-5 rounded-full transition-colors ${exportConfig.isDoubleSided ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  ></div>
                  <div
                    className={`absolute left-0.5 top-0.5 bg-white dark:bg-zinc-800 w-4 h-4 rounded-full transition-transform ${exportConfig.isDoubleSided ? 'translate-x-3' : ''}`}
                  ></div>
                </div>
                <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">双面打印 (预留装订边距)</span>
              </label>
            </div>
          </div>

          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg">
            <button
              onClick={() => setExportConfig((prev: ExportConfig) => ({ ...prev, mode: 'theme' }))}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                exportConfig.mode === 'theme'
                  ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              配色主题模式
            </button>
            <button
              onClick={() => setExportConfig((prev: ExportConfig) => ({ ...prev, mode: 'script' }))}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                exportConfig.mode === 'script'
                  ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              JS 脚本模式
            </button>
          </div>

          {exportConfig.mode === 'theme' ? (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">选择表格主题</label>
              <div className="grid grid-cols-4 gap-3">
                {Object.values(themes).map((theme: ExportTheme) => (
                  <button
                    key={theme.id}
                    data-id={theme.id}
                    onClick={onThemeSelect}
                    className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
                      exportConfig.themeId === theme.id
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-600/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-200/80 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div
                      className="w-full h-8 rounded-lg mb-2"
                      style={{ backgroundColor: `#${theme.headerFill.substring(2)}` }}
                    ></div>
                    <span
                      className={`text-[10px] font-medium truncate w-full text-center ${exportConfig.themeId === theme.id ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'}`}
                    >
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">选择脚本模板</label>
              <div className="space-y-2">
                {scripts.map((script) => (
                  <button
                    key={script.name}
                    data-name={script.name}
                    onClick={onScriptSelect}
                    className={`w-full flex items-center p-3 rounded-xl border transition-all ${
                      exportConfig.templateName === script.name
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-600/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-200/80 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg mr-3">
                      <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-left">
                      <div
                        className={`text-sm font-semibold ${exportConfig.templateName === script.name ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}
                      >
                        {script.name}.js
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                        {script.code.substring(0, 50)}...
                      </div>
                    </div>
                    {exportConfig.templateName === script.name && (
                      <div className="ml-auto w-2 h-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner rounded-full"></div>
                    )}
                  </button>
                ))}
                {scripts.length === 0 && (
                  <div className="py-6 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">暂无脚本，请前往系统设置创建</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">选择并排序导出列</label>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 rounded-full">
                拖拽左侧图标进行排序
              </span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={exportConfig.columns.map((c: ExportColumn) => c.key as string)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {exportConfig.columns.map((col: ExportColumn, idx: number) => {
                    return (
                      <SortableColumn
                        key={col.key}
                        col={col}
                        onToggle={() => {
                          const newCols = [...exportConfig.columns];
                          newCols[idx].selected = !newCols[idx].selected;
                          setExportConfig((prev: ExportConfig) => ({ ...prev, columns: newCols }));
                        }}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <div className="w-full md:w-2/3 flex flex-col items-center bg-zinc-100 dark:bg-zinc-900 p-6 overflow-auto relative min-h-[400px] h-full custom-scrollbar">
          <div className="sticky top-0 self-start text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-zinc-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-6 -ml-6 mb-4">
            打印预览
          </div>
          <div className="w-full bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{exportConfig.title}</h1>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {exportConfig.columns
                    .filter((c: ExportColumn) => c.selected)
                    .map((col: ExportColumn) => (
                      <th
                        key={col.key as string}
                        className="border border-zinc-200/80 dark:border-zinc-600 px-3 py-2 bg-zinc-50 dark:bg-zinc-700 text-left font-semibold text-zinc-700 dark:text-zinc-200"
                      >
                        {col.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((u) => (exportConfig.includeResigned ? true : u.status !== '离职'))
                  .slice(0, 10)
                  .map((u) => (
                    <tr key={u.id}>
                      {exportConfig.columns
                        .filter((c: ExportColumn) => c.selected)
                        .map((col: ExportColumn) => (
                          <td
                            key={col.key as string}
                            className="border border-zinc-200/80 dark:border-zinc-600 px-3 py-2 text-zinc-600 dark:text-zinc-300"
                          >
                            {(u as unknown as Record<string, unknown>)[col.key as string] as string || '-'}
                          </td>
                        ))}
                    </tr>
                  ))}
              </tbody>
            </table>
            {users.filter((u) => (exportConfig.includeResigned ? true : u.status !== '离职')).length > 10 && (
              <div className="text-center py-4 text-sm text-zinc-500 dark:text-zinc-400">
                ... 仅显示前 10 条预览数据，共{' '}
                {users.filter((u) => (exportConfig.includeResigned ? true : u.status !== '离职')).length} 条 ...
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
