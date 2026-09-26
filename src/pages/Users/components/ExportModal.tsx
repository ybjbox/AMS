import React, { useCallback } from 'react';
import { Printer, Download, RefreshCw, Check, GripVertical, FileCode } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { PreviewZoomControl } from '@/components/PreviewZoomControl';
import { usePreviewZoom, zoomStyle } from '@/hooks/usePreviewZoom';
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
  const { zoom, change, reset } = usePreviewZoom('roster-export');
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
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <Button
            variant="outline"
            size="lg"
            onClick={handlePrintRoster}
            disabled={exportConfig.columns.filter((c: ExportColumn) => c.selected).length === 0}
          >
            <Printer className="h-4 w-4 mr-2" />
            打印
          </Button>
          <button
            onClick={() => handleExport(filteredUsersLength)}
            disabled={isExporting || exportConfig.columns.filter((c: ExportColumn) => c.selected).length === 0}
            className="btn-primary w-full sm:w-auto disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                导出中…
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
        <div className="w-full md:w-1/3 p-6 space-y-6 overflow-y-auto border-r border-zinc-100 dark:border-zinc-700 h-full">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">表格大标题</label>
            <Input
              type="text"
              value={exportConfig.title}
              onChange={(e) => setExportConfig((prev: ExportConfig) => ({ ...prev, title: e.target.value }))}
              placeholder="请输入表格标题"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center">
                <Checkbox
                  id="export-include-resigned"
                  checked={exportConfig.includeResigned}
                  onCheckedChange={(checked) => setExportConfig((prev: ExportConfig) => ({ ...prev, includeResigned: checked }))}
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="export-include-resigned" className="ml-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">包含离职人员</label>
              </div>
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
                  value={exportConfig.orientation}
                  onValueChange={(val) => setExportConfig((prev: ExportConfig) => ({ ...prev, orientation: val || 'portrait' }))}
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
                  id="export-double-sided"
                  checked={exportConfig.isDoubleSided}
                  onCheckedChange={(checked) => setExportConfig((prev: ExportConfig) => ({ ...prev, isDoubleSided: checked }))}
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="export-double-sided" className="ml-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">双面打印 (预留装订边距)</label>
              </div>
            </div>
          </div>

          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg">
            <button
              onClick={() => setExportConfig((prev: ExportConfig) => ({ ...prev, mode: 'theme' }))}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                exportConfig.mode === 'theme'
                  ? 'bg-white dark:bg-zinc-800 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              配色主题模式
            </button>
            <button
              onClick={() => setExportConfig((prev: ExportConfig) => ({ ...prev, mode: 'script' }))}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                exportConfig.mode === 'script'
                  ? 'bg-white dark:bg-zinc-800 text-brand-600 dark:text-brand-400 shadow-sm'
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
                    className={`flex flex-col items-center p-2 rounded-xl border transition ${
                      exportConfig.themeId === theme.id
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 ring-2 ring-brand-600/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-200/80 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div
                      className="w-full h-8 rounded-lg mb-2"
                      style={{ backgroundColor: `#${theme.headerFill.substring(2)}` }}
                    ></div>
                    <span
                      className={`text-3xs font-medium truncate w-full text-center ${exportConfig.themeId === theme.id ? 'text-brand-700 dark:text-brand-400' : 'text-zinc-600 dark:text-zinc-400'}`}
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
                    className={`w-full flex items-center p-3 rounded-xl border transition ${
                      exportConfig.templateName === script.name
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 ring-2 ring-brand-600/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-200/80 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="p-1.5 bg-brand-100 dark:bg-brand-900/30 rounded-lg mr-3">
                      <FileCode className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div className="text-left">
                      <div
                        className={`text-sm font-semibold ${exportConfig.templateName === script.name ? 'text-brand-700 dark:text-brand-400' : 'text-zinc-900 dark:text-white'}`}
                      >
                        {script.name}.js
                      </div>
                      <div className="text-3xs text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                        {script.code.substring(0, 50)}...
                      </div>
                    </div>
                    {exportConfig.templateName === script.name && (
                      <div className="ml-auto w-2 h-2 bg-gradient-to-b from-brand-600 to-brand-700 shadow-inner rounded-full"></div>
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
              <span className="text-3xs text-muted-foreground bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 rounded-full">
                拖拽左侧图标进行排序
              </span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={exportConfig.columns.map((c: ExportColumn) => c.key as string)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
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

        <div className="w-full md:w-2/3 flex flex-col items-center bg-zinc-100 dark:bg-zinc-900 px-6 pb-6 overflow-auto relative min-h-[400px] h-full">
          <div className="sticky top-0 z-10 -mx-6 mb-4 flex self-stretch items-center justify-between gap-3 bg-white/90 py-1.5 pl-3 pr-2 text-xs font-medium uppercase tracking-wider text-zinc-500 shadow-sm backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-400">
            <span>打印预览</span>
            <PreviewZoomControl zoom={zoom} onChange={change} onReset={reset} />
          </div>
          <div style={zoomStyle(zoom)} className="w-full bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl p-8">
            <div className="text-center mb-6">
              {/* 纸张标题：页面已有 h1，打印 HTML 由 builder 单独生成 */}
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{exportConfig.title}</h2>
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
                … 仅显示前 10 条预览数据，共{' '}
                {users.filter((u) => (exportConfig.includeResigned ? true : u.status !== '离职')).length} 条 …
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
