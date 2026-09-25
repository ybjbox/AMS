import React, { useEffect, useRef } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PreviewZoomControl } from '@/components/PreviewZoomControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePreviewZoom, zoomStyle } from '@/hooks/usePreviewZoom';
import { PrintSettings } from '../hooks/usePrintSettings';
import { Table } from '../hooks/useSeatingArrange';
import { User } from '@/types';

interface PrintSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  printSettings: PrintSettings;
  setPrintSettings: React.Dispatch<React.SetStateAction<PrintSettings>>;
  tables: Table[];
  handlePrint: () => void;
  getTableDepartments: (members: User[]) => string;
  renderJustifiedName: (name: string, fontSize: number) => React.ReactNode;
}

export function PrintSettingsModal({
  isOpen,
  onClose,
  printSettings,
  setPrintSettings,
  tables,
  handlePrint,
  getTableDepartments,
  renderJustifiedName,
}: PrintSettingsModalProps) {
  const printRef = useRef<HTMLButtonElement>(null);
  const { zoom, change, reset } = usePreviewZoom('seating-cards');

  /**
   * 打开即把焦点放在「打印」上：设置沿用上次（存在服务端），
   * 所以"看一眼预览、回车出纸"就是原来那个一键打印按钮的完整替代。
   * BaseModal 自己在 100ms 后聚焦首个可聚焦元素（标题栏的关闭钮），这里排在它之后接管。
   */
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => printRef.current?.focus(), 160);
    return () => clearTimeout(timer);
  }, [isOpen]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="打印台卡"
      size="full"
      bodyClassName="p-0 overflow-hidden"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <button
            ref={printRef}
            type="button"
            onClick={handlePrint}
            title="回车即可出纸"
            className="btn-primary w-full sm:w-auto"
          >
            打印
          </button>
        </>
      }
    >
      <div className="flex flex-col md:flex-row gap-8 flex-1 min-h-0 p-4 sm:p-6 w-full h-full overflow-hidden">
        {/* Settings Panel */}
        <div className="w-full md:w-[380px] shrink-0 overflow-y-auto pr-2 min-h-0">
          <div className="space-y-3 pb-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">台卡样式</label>
              <Select
                value={printSettings.cardStyle}
                onValueChange={(val) => {
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardStyle: (val || 'style1') as 'style1' | 'style2',
                    contentFontSize: 30,
                    titleFontSize: val === 'style2' ? 30 : 24,
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择样式">
                    {printSettings.cardStyle === 'style1'
                      ? '样式1 (经典双列)'
                      : printSettings.cardStyle === 'style2'
                        ? '样式2 (极简单列)'
                        : '选择样式'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="style1">样式1 (经典双列)</SelectItem>
                  <SelectItem value="style2">样式2 (极简单列)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {printSettings.cardStyle === 'style1' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">台卡标题</label>
                  <Input
                    type="text"
                    value={printSettings.cardTitle}
                    onChange={(e) => setPrintSettings((prev) => ({ ...prev, cardTitle: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">底部文字</label>
                  <Input
                    type="text"
                    value={printSettings.footerText}
                    onChange={(e) => setPrintSettings((prev) => ({ ...prev, footerText: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">主题颜色</label>
              <div className="flex items-center space-x-3">
                {/* 原生 color 取色器：ui 库无对应原语（契约仅覆盖 text/date/number/tel/email），保留原生 */}
                <input
                  type="color"
                  value={printSettings.themeColor}
                  onChange={(e) => setPrintSettings((prev) => ({ ...prev, themeColor: e.target.value }))}
                  className="h-9 w-14 rounded border border-zinc-200/80 dark:border-zinc-600 bg-white dark:bg-zinc-700 cursor-pointer p-0.5"
                />
                <span className="text-sm text-zinc-500 dark:text-zinc-400 uppercase">{printSettings.themeColor}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">宽度 (cm)</label>
              <Input
                type="number"
                step="0.1"
                value={printSettings.cardWidth / 10}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardWidth: Math.round(parseFloat(e.target.value) * 10) || 210,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">高度 (cm)</label>
              <Input
                type="number"
                step="0.1"
                value={printSettings.cardHeight / 10}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardHeight: Math.round(parseFloat(e.target.value) * 10) || 297,
                  }))
                }
              />
            </div>
          </div>
          <div className="text-xs text-brand-600 mt-1">默认使用A4纸的尺寸</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">标题字号 (px)</label>
              <Input
                type="number"
                value={printSettings.titleFontSize}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    titleFontSize: parseInt(e.target.value) || (prev.cardStyle === 'style2' ? 30 : 24),
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">桌号字号 (px)</label>
              <Input
                type="number"
                value={printSettings.numberFontSize}
                onChange={(e) =>
                  setPrintSettings((prev) => ({ ...prev, numberFontSize: parseInt(e.target.value) || 48 }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">标题字体</label>
              <Select
                value={printSettings.titleFontFamily}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, titleFontFamily: val || '"Microsoft YaHei", "SimHei", sans-serif' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择字体">
                    {printSettings.titleFontFamily === '"Noto Serif SC", "SimSun", serif'
                      ? '思源宋体 / 宋体'
                      : printSettings.titleFontFamily === '"Microsoft YaHei", "SimHei", sans-serif'
                        ? '微软雅黑 / 黑体'
                        : printSettings.titleFontFamily === '"KaiTi", "STKaiti", serif'
                          ? '楷体'
                          : printSettings.titleFontFamily === '"FangSong", "STFangsong", serif'
                            ? '仿宋'
                            : '选择字体'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                  <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                  <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                  <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">桌号字体</label>
              <Select
                value={printSettings.numberFontFamily}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, numberFontFamily: val || '"Microsoft YaHei", "SimHei", sans-serif' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择字体">
                    {printSettings.numberFontFamily === '"Noto Serif SC", "SimSun", serif'
                      ? '思源宋体 / 宋体'
                      : printSettings.numberFontFamily === '"Microsoft YaHei", "SimHei", sans-serif'
                        ? '微软雅黑 / 黑体'
                        : printSettings.numberFontFamily === '"KaiTi", "STKaiti", serif'
                          ? '楷体'
                          : printSettings.numberFontFamily === '"FangSong", "STFangsong", serif'
                            ? '仿宋'
                            : '选择字体'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                  <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                  <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                  <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">内容字体</label>
              <Select
                value={printSettings.contentFontFamily}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, contentFontFamily: val || '"Microsoft YaHei", "SimHei", sans-serif' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择字体">
                    {printSettings.contentFontFamily === '"Noto Serif SC", "SimSun", serif'
                      ? '思源宋体 / 宋体'
                      : printSettings.contentFontFamily === '"Microsoft YaHei", "SimHei", sans-serif'
                        ? '微软雅黑 / 黑体'
                        : printSettings.contentFontFamily === '"KaiTi", "STKaiti", serif'
                          ? '楷体'
                          : printSettings.contentFontFamily === '"FangSong", "STFangsong", serif'
                            ? '仿宋'
                            : '选择字体'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                  <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                  <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                  <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {printSettings.cardStyle === 'style1' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">底部字体</label>
                <Select
                  value={printSettings.footerFontFamily}
                  onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, footerFontFamily: val || '"Microsoft YaHei", "SimHei", sans-serif' }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择字体">
                      {printSettings.footerFontFamily === '"Noto Serif SC", "SimSun", serif'
                        ? '思源宋体 / 宋体'
                        : printSettings.footerFontFamily === '"Microsoft YaHei", "SimHei", sans-serif'
                          ? '微软雅黑 / 黑体'
                          : printSettings.footerFontFamily === '"KaiTi", "STKaiti", serif'
                            ? '楷体'
                            : printSettings.footerFontFamily === '"FangSong", "STFangsong", serif'
                              ? '仿宋'
                              : '选择字体'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                    <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                    <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                    <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-700">
            {printSettings.cardStyle === 'style1' && (
              <>
                <label htmlFor="print-show-members" className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    id="print-show-members"
                    checked={printSettings.showMembers}
                    onCheckedChange={(checked) => setPrintSettings((prev) => ({ ...prev, showMembers: checked }))}
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">显示成员名单</span>
                </label>
                {printSettings.showMembers && (
                  <div className="pl-6 space-y-2">
                    <label htmlFor="print-show-index" className="flex items-center space-x-2 cursor-pointer">
                      <Checkbox
                        id="print-show-index"
                        checked={printSettings.showIndex}
                        onCheckedChange={(checked) => setPrintSettings((prev) => ({ ...prev, showIndex: checked }))}
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">显示序号</span>
                    </label>
                    <label htmlFor="print-show-department" className="flex items-center space-x-2 cursor-pointer">
                      <Checkbox
                        id="print-show-department"
                        checked={printSettings.showDepartment}
                        onCheckedChange={(checked) => setPrintSettings((prev) => ({ ...prev, showDepartment: checked }))}
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">显示部门</span>
                    </label>
                    <label htmlFor="print-show-role" className="flex items-center space-x-2 cursor-pointer">
                      <Checkbox
                        id="print-show-role"
                        checked={printSettings.showRole}
                        onCheckedChange={(checked) => setPrintSettings((prev) => ({ ...prev, showRole: checked }))}
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">显示职位</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          内容字号 (px)
                        </label>
                        <Input
                          type="number"
                          value={printSettings.contentFontSize}
                          onChange={(e) =>
                            setPrintSettings((prev) => ({ ...prev, contentFontSize: parseInt(e.target.value) || 30 }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          内容对齐
                        </label>
                        <Select
                          value={printSettings.textAlign}
                          onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, textAlign: (val || 'left') as 'left' | 'center' | 'right' }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择对齐方式">
                              {printSettings.textAlign === 'left'
                                ? '居左'
                                : printSettings.textAlign === 'center'
                                  ? '居中'
                                  : printSettings.textAlign === 'right'
                                    ? '居右'
                                    : '选择对齐方式'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">居左</SelectItem>
                            <SelectItem value="center">居中</SelectItem>
                            <SelectItem value="right">居右</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {printSettings.cardStyle === 'style2' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  内容字号 (px)
                </label>
                <Input
                  type="number"
                  value={printSettings.contentFontSize}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({ ...prev, contentFontSize: parseInt(e.target.value) || 30 }))
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="flex-1 flex flex-col items-center bg-zinc-100 dark:bg-zinc-900 rounded-lg p-6 overflow-y-auto relative min-h-[300px] md:min-h-0">
          <div className="sticky top-0 z-10 -mt-6 -ml-6 mb-4 flex w-[calc(100%+1.5rem)] items-center justify-between gap-3 bg-white/90 py-1.5 pl-3 pr-2 text-xs font-medium uppercase tracking-wider text-zinc-500 shadow-sm backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-400">
            <span>打印预览 ({tables.length}桌)</span>
            <PreviewZoomControl zoom={zoom} onChange={change} onReset={reset} />
          </div>

          <div style={zoomStyle(zoom)} className="flex flex-col gap-8 items-center w-full pt-2">
            {tables.map((table, tableIndex) => (
              <div key={table.number} className="flex flex-col items-center">
                <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">第 {tableIndex + 1} 页</div>
                {/* Scale wrapper to maintain layout space for scaled content */}
                <div
                  style={{
                    width: `${printSettings.cardWidth * 0.5}mm`,
                    minHeight: `${printSettings.cardHeight * 0.5}mm`,
                  }}
                  className="flex-shrink-0 relative"
                >
                  <div
                    className="absolute top-0 left-0 flex flex-col bg-white dark:bg-zinc-800 box-border break-inside-avoid shadow-lg transition-all duration-300 origin-top-left"
                    style={{
                      width: `${printSettings.cardWidth}mm`,
                      minHeight: `${printSettings.cardHeight}mm`,
                      border: printSettings.cardStyle === 'style1' ? `4px double ${printSettings.themeColor}` : 'none',
                      borderRadius: printSettings.cardStyle === 'style1' ? '20px' : '0',
                      padding: '20px',
                      transform: 'scale(0.5)',
                    }}
                  >
                    {printSettings.cardStyle === 'style1' ? (
                      <>
                        <div
                          className="text-center border-b-2 pb-3 mb-3"
                          style={{ borderColor: printSettings.themeColor }}
                        >
                          <div
                            className="mb-1"
                            style={{
                              color: printSettings.themeColor,
                              fontFamily: printSettings.titleFontFamily,
                              fontSize: `${printSettings.titleFontSize}px`,
                              letterSpacing: '4px',
                            }}
                          >
                            {printSettings.cardTitle}
                          </div>
                          <div
                            className="font-black"
                            style={{
                              color: printSettings.themeColor,
                              fontSize: `${printSettings.numberFontSize}px`,
                              fontFamily: printSettings.numberFontFamily,
                            }}
                          >
                            {table.number}号桌
                          </div>
                        </div>

                        {printSettings.showMembers ? (
                          <div
                            className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1"
                            style={{ fontFamily: printSettings.contentFontFamily }}
                          >
                            {table.members.map((m, idx) => (
                              <div key={m.id} className="flex items-center p-2 bg-zinc-50 rounded-lg">
                                {printSettings.showIndex && (
                                  <div
                                    className="font-bold text-zinc-400 mr-3 flex-shrink-0 text-right"
                                    style={{
                                      fontSize: `${printSettings.contentFontSize * 1.2}px`,
                                      width: '1.5em',
                                    }}
                                  >
                                    {idx + 1}
                                  </div>
                                )}
                                <div
                                  className="flex-1 overflow-hidden"
                                  style={{ textAlign: printSettings.textAlign as React.CSSProperties['textAlign'] }}
                                >
                                  <div
                                    className="font-bold text-zinc-900 dark:text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis"
                                    style={{ fontSize: `${printSettings.contentFontSize * 1.2}px` }}
                                  >
                                    {m.name}
                                  </div>
                                  {(printSettings.showDepartment || printSettings.showRole) && (
                                    <div
                                      className="text-muted-foreground mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                                      style={{ fontSize: `${printSettings.contentFontSize}px` }}
                                    >
                                      {printSettings.showDepartment ? m.department : ''}
                                      {printSettings.showDepartment && printSettings.showRole ? ' · ' : ''}
                                      {printSettings.showRole ? m.role : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex-1"></div>
                        )}

                        <div
                          className="mt-3 text-center text-3xs text-zinc-400"
                          style={{ fontFamily: printSettings.footerFontFamily }}
                        >
                          {printSettings.footerText}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col h-full" style={{ color: printSettings.themeColor }}>
                        <div className="text-center mb-8">
                          <div className="flex items-baseline justify-center gap-2 mb-4">
                            <span
                              className="font-black"
                              style={{
                                fontSize: `${printSettings.numberFontSize}px`,
                                fontFamily: printSettings.numberFontFamily,
                              }}
                            >
                              {table.number} 号桌
                            </span>
                            <span
                              className="font-medium"
                              style={{
                                fontSize: `${printSettings.titleFontSize}px`,
                                fontFamily: printSettings.titleFontFamily,
                              }}
                            >
                              ({table.members.length}人)
                            </span>
                          </div>
                          <div
                            className="font-medium"
                            style={{
                              fontSize: `${printSettings.titleFontSize * 0.8}px`,
                              fontFamily: printSettings.titleFontFamily,
                            }}
                          >
                            ({getTableDepartments(table.members)})
                          </div>
                        </div>

                        <div
                          className="flex-1 flex flex-col items-center justify-start gap-4"
                          style={{ fontFamily: printSettings.contentFontFamily }}
                        >
                          {table.members.map((m) => (
                            <div
                              key={m.id}
                              className="font-bold whitespace-nowrap"
                              style={{ fontSize: `${printSettings.contentFontSize * 1.5}px` }}
                            >
                              {renderJustifiedName(m.name, printSettings.contentFontSize * 1.5)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
