import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrintSettings } from '../hooks/usePrintSettings';
import { Table } from '../hooks/useSeatingArrange';
import { PrintPreview } from './PrintPreview';

interface PrintSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  printSettings: PrintSettings;
  setPrintSettings: React.Dispatch<React.SetStateAction<PrintSettings>>;
  tables: Table[];
  handlePrint: () => void;
  getTableDepartments: (members: any[]) => string;
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
  renderJustifiedName
}: PrintSettingsModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="台卡打印设置"
      size="full"
      bodyClassName="p-0 overflow-hidden"
      footer={
        <>
          <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm">取消</button>
          <button type="button" onClick={handlePrint} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm">直接打印</button>
        </>
      }
    >
      <div className="flex flex-col md:flex-row gap-8 flex-1 min-h-0 p-4 sm:p-6 w-full h-full overflow-hidden">
        {/* Settings Panel */}
        <div className="w-full md:w-[380px] shrink-0 overflow-y-auto pr-2 min-h-0 custom-scrollbar">
          <div className="space-y-3 pb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">台卡样式</label>
              <Select value={printSettings.cardStyle} onValueChange={(val) => {
                setPrintSettings(prev => ({ 
                  ...prev, 
                  cardStyle: val,
                  contentFontSize: 30,
                  titleFontSize: val === 'style2' ? 30 : 24
                }));
              }}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择样式">
                    {printSettings.cardStyle === 'style1' ? '样式1 (经典双列)' : printSettings.cardStyle === 'style2' ? '样式2 (极简单列)' : '选择样式'}
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">台卡标题</label>
                  <input 
                    type="text" 
                    value={printSettings.cardTitle}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, cardTitle: e.target.value }))}
                    className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">底部文字</label>
                  <input 
                    type="text" 
                    value={printSettings.footerText}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, footerText: e.target.value }))}
                    className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">主题颜色</label>
              <div className="flex items-center space-x-3">
                <input 
                  type="color" 
                  value={printSettings.themeColor}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, themeColor: e.target.value }))}
                  className="h-9 w-14 rounded border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 cursor-pointer p-0.5" 
                />
                <span className="text-sm text-slate-500 dark:text-slate-400 uppercase">{printSettings.themeColor}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">宽度 (cm)</label>
              <input 
                type="number" 
                step="0.1"
                value={printSettings.cardWidth / 10}
                onChange={(e) => setPrintSettings(prev => ({ ...prev, cardWidth: Math.round(parseFloat(e.target.value) * 10) || 210 }))}
                className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">高度 (cm)</label>
              <input 
                type="number" 
                step="0.1"
                value={printSettings.cardHeight / 10}
                onChange={(e) => setPrintSettings(prev => ({ ...prev, cardHeight: Math.round(parseFloat(e.target.value) * 10) || 297 }))}
                className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
              />
            </div>
          </div>
          <div className="text-xs text-blue-600 mt-1">默认使用A4纸的尺寸</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标题字号 (px)</label>
              <input 
                type="number" 
                value={printSettings.titleFontSize}
                onChange={(e) => setPrintSettings(prev => ({ ...prev, titleFontSize: parseInt(e.target.value) || (prev.cardStyle === 'style2' ? 30 : 24) }))}
                className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">桌号字号 (px)</label>
              <input 
                type="number" 
                value={printSettings.numberFontSize}
                onChange={(e) => setPrintSettings(prev => ({ ...prev, numberFontSize: parseInt(e.target.value) || 48 }))}
                className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标题字体</label>
              <Select value={printSettings.titleFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, titleFontFamily: val }))}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择字体">
                    {printSettings.titleFontFamily === '"Noto Serif SC", "SimSun", serif' ? '思源宋体 / 宋体' : 
                     printSettings.titleFontFamily === '"Microsoft YaHei", "SimHei", sans-serif' ? '微软雅黑 / 黑体' : 
                     printSettings.titleFontFamily === '"KaiTi", "STKaiti", serif' ? '楷体' : 
                     printSettings.titleFontFamily === '"FangSong", "STFangsong", serif' ? '仿宋' : '选择字体'}
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">桌号字体</label>
              <Select value={printSettings.numberFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, numberFontFamily: val }))}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择字体">
                    {printSettings.numberFontFamily === '"Noto Serif SC", "SimSun", serif' ? '思源宋体 / 宋体' : 
                     printSettings.numberFontFamily === '"Microsoft YaHei", "SimHei", sans-serif' ? '微软雅黑 / 黑体' : 
                     printSettings.numberFontFamily === '"KaiTi", "STKaiti", serif' ? '楷体' : 
                     printSettings.numberFontFamily === '"FangSong", "STFangsong", serif' ? '仿宋' : '选择字体'}
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">内容字体</label>
              <Select value={printSettings.contentFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, contentFontFamily: val }))}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择字体">
                    {printSettings.contentFontFamily === '"Noto Serif SC", "SimSun", serif' ? '思源宋体 / 宋体' : 
                     printSettings.contentFontFamily === '"Microsoft YaHei", "SimHei", sans-serif' ? '微软雅黑 / 黑体' : 
                     printSettings.contentFontFamily === '"KaiTi", "STKaiti", serif' ? '楷体' : 
                     printSettings.contentFontFamily === '"FangSong", "STFangsong", serif' ? '仿宋' : '选择字体'}
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">底部字体</label>
                <Select value={printSettings.footerFontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, footerFontFamily: val }))}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                    <SelectValue placeholder="选择字体">
                      {printSettings.footerFontFamily === '"Noto Serif SC", "SimSun", serif' ? '思源宋体 / 宋体' : 
                       printSettings.footerFontFamily === '"Microsoft YaHei", "SimHei", sans-serif' ? '微软雅黑 / 黑体' : 
                       printSettings.footerFontFamily === '"KaiTi", "STKaiti", serif' ? '楷体' : 
                       printSettings.footerFontFamily === '"FangSong", "STFangsong", serif' ? '仿宋' : '选择字体'}
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
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            {printSettings.cardStyle === 'style1' && (
              <>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={printSettings.showMembers}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, showMembers: e.target.checked }))}
                    className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">显示成员名单</span>
                </label>
                {printSettings.showMembers && (
                  <div className="pl-6 space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={printSettings.showIndex}
                        onChange={(e) => setPrintSettings(prev => ({ ...prev, showIndex: e.target.checked }))}
                        className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">显示序号</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={printSettings.showDepartment}
                        onChange={(e) => setPrintSettings(prev => ({ ...prev, showDepartment: e.target.checked }))}
                        className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">显示部门</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={printSettings.showRole}
                        onChange={(e) => setPrintSettings(prev => ({ ...prev, showRole: e.target.checked }))}
                        className="rounded border-zinc-200/80 dark:border-slate-600 text-blue-600 focus:ring-blue-600 dark:bg-slate-700"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">显示职位</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">内容字号 (px)</label>
                        <input 
                          type="number" 
                          value={printSettings.contentFontSize}
                          onChange={(e) => setPrintSettings(prev => ({ ...prev, contentFontSize: parseInt(e.target.value) || 30 }))}
                          className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">内容对齐</label>
                        <Select value={printSettings.textAlign} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, textAlign: val }))}>
                          <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                            <SelectValue placeholder="选择对齐方式">
                              {printSettings.textAlign === 'left' ? '居左' : printSettings.textAlign === 'center' ? '居中' : printSettings.textAlign === 'right' ? '居右' : '选择对齐方式'}
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">内容字号 (px)</label>
                <input 
                  type="number" 
                  value={printSettings.contentFontSize}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, contentFontSize: parseInt(e.target.value) || 30 }))}
                  className="block w-full border border-zinc-200/80 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
                />
              </div>
            )}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="flex-1 flex flex-col items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-6 overflow-y-auto relative min-h-[300px] md:min-h-0">
          <div className="sticky top-0 self-start text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-6 -ml-6 mb-4">打印预览 ({tables.length}桌)</div>
          
          <div className="flex flex-col gap-8 items-center w-full pt-2">
            {tables.map((table, tableIndex) => (
              <div key={table.number} className="flex flex-col items-center">
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">第 {tableIndex + 1} 页</div>
                {/* Scale wrapper to maintain layout space for scaled content */}
                <div 
                  style={{ 
                    width: `${printSettings.cardWidth * 0.5}mm`, 
                    minHeight: `${printSettings.cardHeight * 0.5}mm` 
                  }}
                  className="flex-shrink-0 relative"
                >
                  <div 
                    className="absolute top-0 left-0 flex flex-col bg-white box-border break-inside-avoid shadow-lg transition-all duration-300 origin-top-left"
                    style={{ 
                      width: `${printSettings.cardWidth}mm`, 
                      minHeight: `${printSettings.cardHeight}mm`,
                      border: printSettings.cardStyle === 'style1' ? `4px double ${printSettings.themeColor}` : 'none',
                      borderRadius: printSettings.cardStyle === 'style1' ? '20px' : '0',
                      padding: '20px',
                      transform: 'scale(0.5)'
                    }}
                  >
                  {printSettings.cardStyle === 'style1' ? (
                    <>
                      <div className="text-center border-b-2 pb-3 mb-3" style={{ borderColor: printSettings.themeColor }}>
                        <div 
                          className="mb-1"
                          style={{ 
                            color: printSettings.themeColor,
                            fontFamily: printSettings.titleFontFamily, 
                            fontSize: `${printSettings.titleFontSize}px`,
                            letterSpacing: '4px'
                          }}
                        >
                          {printSettings.cardTitle}
                        </div>
                        <div 
                          className="font-black"
                          style={{ color: printSettings.themeColor, fontSize: `${printSettings.numberFontSize}px`, fontFamily: printSettings.numberFontFamily }}
                        >
                          {table.number}号桌
                        </div>
                      </div>
                      
                      {printSettings.showMembers ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1" style={{ fontFamily: printSettings.contentFontFamily }}>
                          {table.members.map((m, idx) => (
                            <div key={m.id} className="flex items-center p-2 bg-slate-50 rounded-lg">
                              {printSettings.showIndex && (
                                <div 
                                  className="font-bold text-slate-400 mr-3 flex-shrink-0 text-right"
                                  style={{ 
                                    fontSize: `${printSettings.contentFontSize * 1.2}px`,
                                    width: '1.5em'
                                  }}
                                >
                                  {idx + 1}
                                </div>
                              )}
                              <div className="flex-1 overflow-hidden" style={{ textAlign: printSettings.textAlign as any }}>
                                <div 
                                  className="font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis"
                                  style={{ fontSize: `${printSettings.contentFontSize * 1.2}px` }}
                                >
                                  {m.name}
                                </div>
                                {(printSettings.showDepartment || printSettings.showRole) && (
                                  <div 
                                    className="text-slate-500 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
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
                      
                      <div className="mt-3 text-center text-[10px] text-slate-400" style={{ fontFamily: printSettings.footerFontFamily }}>
                        {printSettings.footerText}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col h-full" style={{ color: printSettings.themeColor }}>
                      <div className="text-center mb-8">
                        <div className="flex items-baseline justify-center gap-2 mb-4">
                          <span 
                            className="font-black"
                            style={{ fontSize: `${printSettings.numberFontSize}px`, fontFamily: printSettings.numberFontFamily }}
                          >
                            {table.number} 号桌
                          </span>
                          <span 
                            className="font-medium"
                            style={{ fontSize: `${printSettings.titleFontSize}px`, fontFamily: printSettings.titleFontFamily }}
                          >
                            ({table.members.length}人)
                          </span>
                        </div>
                        <div 
                          className="font-medium"
                          style={{ fontSize: `${printSettings.titleFontSize * 0.8}px`, fontFamily: printSettings.titleFontFamily }}
                        >
                          ({getTableDepartments(table.members)})
                        </div>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-center justify-start gap-4" style={{ fontFamily: printSettings.contentFontFamily }}>
                        {table.members.map(m => (
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
