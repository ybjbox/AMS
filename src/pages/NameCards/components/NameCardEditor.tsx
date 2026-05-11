import React from 'react';
import { Settings2, Minus, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrintSettings } from '../constants';

interface NameCardEditorProps {
  printSettings: PrintSettings;
  setPrintSettings: React.Dispatch<React.SetStateAction<PrintSettings>>;
  handlePaperSizeChange: (size: 'A4' | 'A5' | 'custom') => void;
  handlePaperOrientationChange: (orientation: 'portrait' | 'landscape') => void;
}

export default function NameCardEditor({
  printSettings,
  setPrintSettings,
  handlePaperSizeChange,
  handlePaperOrientationChange
}: NameCardEditorProps) {
  return (
    <div className="w-80 bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 overflow-y-auto p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-white mb-4 flex items-center">
          <Settings2 className="h-4 w-4 mr-2" />
          打印设置
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">纸张尺寸</label>
            <Select value={printSettings.paperSize} onValueChange={(val) => handlePaperSizeChange(val as 'A4' | 'A5' | 'custom')}>
              <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                <SelectValue placeholder="选择尺寸">
                  {(val) =>
                    val === 'A4'
                      ? 'A4 (210x297mm)'
                      : val === 'A5'
                        ? 'A5 (148x210mm)'
                        : val === 'custom'
                          ? '自定义'
                          : '选择尺寸'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4 (210x297mm)</SelectItem>
                <SelectItem value="A5">A5 (148x210mm)</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">纸张方向</label>
            <Select
              value={printSettings.paperOrientation}
              onValueChange={(val) => handlePaperOrientationChange(val as 'portrait' | 'landscape')}
            >
              <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                <SelectValue placeholder="选择方向">
                  {(val) => (val === 'portrait' ? '纵向' : val === 'landscape' ? '横向' : '选择方向')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">纵向</SelectItem>
                <SelectItem value="landscape">横向</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {printSettings.paperSize === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  纸张宽 (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={printSettings.paperWidth / 10}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({
                      ...prev,
                      paperWidth: Math.round(parseFloat(e.target.value) * 10) || 210,
                    }))
                  }
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  纸张高 (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={printSettings.paperHeight / 10}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({
                      ...prev,
                      paperHeight: Math.round(parseFloat(e.target.value) * 10) || 297,
                    }))
                  }
                  className="input-base"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                台卡宽 (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={printSettings.cardWidth / 10}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardWidth: Math.round(parseFloat(e.target.value) * 10) || 90,
                  }))
                }
                className="input-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                台卡高 (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={printSettings.cardHeight / 10}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardHeight: Math.round(parseFloat(e.target.value) * 10) || 54,
                  }))
                }
                className="input-base"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={printSettings.isDoubleSided}
                onChange={(e) => setPrintSettings((prev) => ({ ...prev, isDoubleSided: e.target.checked }))}
                className="rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-zinc-700"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">双面帐篷式折叠 (高度翻倍)</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              每人打印份数
            </label>
            <div className="flex items-center border border-zinc-200/80 dark:border-zinc-600 rounded-md overflow-hidden">
              <button
                onClick={() =>
                  setPrintSettings((prev) => ({ ...prev, copiesPerName: Math.max(1, prev.copiesPerName - 1) }))
                }
                className="px-3 py-2 bg-zinc-50 dark:bg-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                value={printSettings.copiesPerName}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    copiesPerName: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
                className="flex-1 w-full text-center border-none py-2 focus:ring-0 sm:text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              />
              <button
                onClick={() => setPrintSettings((prev) => ({ ...prev, copiesPerName: prev.copiesPerName + 1 }))}
                className="px-3 py-2 bg-zinc-50 dark:bg-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-white mb-4">样式设置</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">字体</label>
            <div className="flex items-center space-x-2">
              <Select
                value={printSettings.fontFamily}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, fontFamily: val || '"Microsoft YaHei", "SimHei", sans-serif' }))}
              >
                <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                  <SelectValue placeholder="选择字体">
                    {(val) => {
                      if (val === '"Microsoft YaHei", "SimHei", sans-serif') return '微软雅黑 / 黑体';
                      if (val === '"Noto Serif SC", "SimSun", serif') return '思源宋体 / 宋体';
                      if (val === '"KaiTi", "STKaiti", serif') return '楷体';
                      if (val === '"FangSong", "STFangsong", serif') return '仿宋';
                      return '选择字体';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                  <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                  <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                  <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center space-x-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={printSettings.isBold}
                  onChange={(e) => setPrintSettings((prev) => ({ ...prev, isBold: e.target.checked }))}
                  className="rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-zinc-700"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">加粗</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">排版方向</label>
              <Select
                value={printSettings.layout}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, layout: val as 'horizontal' | 'vertical' }))}
              >
                <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                  <SelectValue placeholder="选择排版方向">
                    {(val) => (val === 'horizontal' ? '横排' : val === 'vertical' ? '竖排' : '选择排版方向')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">横排</SelectItem>
                  <SelectItem value="vertical">竖排</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">对齐方式</label>
              <Select
                value={printSettings.textAlign}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, textAlign: val as 'left' | 'center' | 'right' }))}
              >
                <SelectTrigger className="w-full bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                  <SelectValue placeholder="选择对齐方式">
                    {(val) =>
                      val === 'left'
                        ? '居左/靠上'
                        : val === 'center'
                          ? '居中'
                          : val === 'right'
                            ? '居右/靠下'
                            : '选择对齐方式'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">居左/靠上</SelectItem>
                  <SelectItem value="center">居中</SelectItem>
                  <SelectItem value="right">居右/靠下</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                姓名大小 (px)
              </label>
              <input
                type="number"
                value={printSettings.fontSize}
                onChange={(e) =>
                  setPrintSettings((prev) => ({ ...prev, fontSize: parseInt(e.target.value) || 32 }))
                }
                className="input-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">字体颜色</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={printSettings.fontColor}
                  onChange={(e) => setPrintSettings((prev) => ({ ...prev, fontColor: e.target.value }))}
                  className="h-8 w-12 rounded border border-zinc-200/80 dark:border-zinc-600 cursor-pointer p-0.5 bg-white dark:bg-zinc-700"
                />
                <span className="text-xs text-zinc-500 uppercase">{printSettings.fontColor}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">背景颜色</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={printSettings.backgroundColor}
                  onChange={(e) => setPrintSettings((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                  className="h-8 w-12 rounded border border-zinc-200/80 dark:border-zinc-600 cursor-pointer p-0.5 bg-white dark:bg-zinc-700"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">
                  {printSettings.backgroundColor}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-700">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={printSettings.showDepartment}
                onChange={(e) => setPrintSettings((prev) => ({ ...prev, showDepartment: e.target.checked }))}
                className="rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-zinc-700"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">显示部门</span>
            </label>
            {printSettings.showDepartment && (
              <div className="pl-6">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  部门字号 (px)
                </label>
                <input
                  type="number"
                  value={printSettings.departmentFontSize}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({ ...prev, departmentFontSize: parseInt(e.target.value) || 14 }))
                  }
                  className="input-base"
                />
              </div>
            )}

            <label className="flex items-center space-x-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={printSettings.showRole}
                onChange={(e) => setPrintSettings((prev) => ({ ...prev, showRole: e.target.checked }))}
                className="rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-zinc-700"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">显示职位</span>
            </label>
            {printSettings.showRole && (
              <div className="pl-6">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  职位字号 (px)
                </label>
                <input
                  type="number"
                  value={printSettings.roleFontSize}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({ ...prev, roleFontSize: parseInt(e.target.value) || 14 }))
                  }
                  className="input-base"
                />
              </div>
            )}

            <label className="flex items-center space-x-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={printSettings.showCompanyName}
                onChange={(e) => setPrintSettings((prev) => ({ ...prev, showCompanyName: e.target.checked }))}
                className="rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600 bg-white dark:bg-zinc-700"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">显示公司名称</span>
            </label>
            {printSettings.showCompanyName && (
              <div className="pl-6 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    公司名称
                  </label>
                  <input
                    type="text"
                    value={printSettings.companyName}
                    onChange={(e) => setPrintSettings((prev) => ({ ...prev, companyName: e.target.value }))}
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    公司名称字号 (px)
                  </label>
                  <input
                    type="number"
                    value={printSettings.companyNameFontSize}
                    onChange={(e) =>
                      setPrintSettings((prev) => ({ ...prev, companyNameFontSize: parseInt(e.target.value) || 16 }))
                    }
                    className="input-base"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
