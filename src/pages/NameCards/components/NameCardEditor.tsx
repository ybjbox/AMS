import React from 'react';
import { Settings2, Minus, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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
    <div className="w-full md:w-80 shrink-0 bg-white dark:bg-zinc-800 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-700 p-6 space-y-6 md:min-h-0 md:overflow-y-auto">
      <div>
        <div className="text-sm font-semibold text-zinc-800 dark:text-white mb-4 flex items-center">
          <Settings2 className="h-4 w-4 mr-2" />
          打印设置
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">纸张尺寸</label>
            <Select
              value={printSettings.paperSize}
              onValueChange={(val) => handlePaperSizeChange(val as 'A4' | 'A5' | 'custom')}
              items={[
                { value: 'A4', label: 'A4 (210x297mm)' },
                { value: 'A5', label: 'A5 (148x210mm)' },
                { value: 'custom', label: '自定义' },
              ]}
            >
              <SelectTrigger aria-label="纸张尺寸" className="w-full">
                <SelectValue placeholder="选择尺寸" />
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
              items={[
                { value: 'portrait', label: '纵向' },
                { value: 'landscape', label: '横向' },
              ]}
            >
              <SelectTrigger aria-label="纸张方向" className="w-full">
                <SelectValue placeholder="选择方向" />
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
                <Input
                  type="number"
                  step="0.1"
                  aria-label="纸张宽 (cm)"
                  value={printSettings.paperWidth / 10}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({
                      ...prev,
                      paperWidth: Math.round(parseFloat(e.target.value) * 10) || 210,
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  纸张高 (cm)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  aria-label="纸张高 (cm)"
                  value={printSettings.paperHeight / 10}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({
                      ...prev,
                      paperHeight: Math.round(parseFloat(e.target.value) * 10) || 297,
                    }))
                  }
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                台卡宽 (cm)
              </label>
              <Input
                type="number"
                step="0.1"
                aria-label="台卡宽 (cm)"
                value={printSettings.cardWidth / 10}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardWidth: Math.round(parseFloat(e.target.value) * 10) || 90,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                台卡高 (cm)
              </label>
              <Input
                type="number"
                step="0.1"
                aria-label="台卡高 (cm)"
                value={printSettings.cardHeight / 10}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    cardHeight: Math.round(parseFloat(e.target.value) * 10) || 54,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="nc-double-sided"
                checked={printSettings.isDoubleSided}
                onCheckedChange={(c) => setPrintSettings((prev) => ({ ...prev, isDoubleSided: c === true }))}
                className="border-zinc-300 dark:border-zinc-600"
              />
              <label
                htmlFor="nc-double-sided"
                className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                双面帐篷式折叠 (高度翻倍)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              每人打印份数
            </label>
            <div className="flex items-center border border-zinc-200/80 dark:border-zinc-600 rounded-lg overflow-hidden">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setPrintSettings((prev) => ({ ...prev, copiesPerName: Math.max(1, prev.copiesPerName - 1) }))
                }
                aria-label="减少打印份数"
                className="size-9 shrink-0 rounded-none border-0 bg-zinc-50 dark:bg-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-600"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                aria-label="每人打印份数"
                value={printSettings.copiesPerName}
                onChange={(e) =>
                  setPrintSettings((prev) => ({
                    ...prev,
                    copiesPerName: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
                className="h-9 flex-1 rounded-none border-0 bg-white text-center focus-visible:ring-0 dark:bg-zinc-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPrintSettings((prev) => ({ ...prev, copiesPerName: prev.copiesPerName + 1 }))}
                aria-label="增加打印份数"
                className="size-9 shrink-0 rounded-none border-0 bg-zinc-50 dark:bg-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-600"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-zinc-200 dark:border-zinc-700">
        <div className="text-sm font-semibold text-zinc-800 dark:text-white mb-4">样式设置</div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">字体</label>
            <div className="flex items-center space-x-2">
              <Select
                value={printSettings.fontFamily}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, fontFamily: val || '"Microsoft YaHei", "SimHei", sans-serif' }))}
                items={[
                  { value: '"Microsoft YaHei", "SimHei", sans-serif', label: '微软雅黑 / 黑体' },
                  { value: '"Noto Serif SC", "SimSun", serif', label: '思源宋体 / 宋体' },
                  { value: '"KaiTi", "STKaiti", serif', label: '楷体' },
                  { value: '"FangSong", "STFangsong", serif', label: '仿宋' },
                ]}
              >
                <SelectTrigger aria-label="字体" className="w-full">
                  <SelectValue placeholder="选择字体" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                  <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                  <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                  <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2 whitespace-nowrap">
                <Checkbox
                  id="nc-is-bold"
                  checked={printSettings.isBold}
                  onCheckedChange={(c) => setPrintSettings((prev) => ({ ...prev, isBold: c === true }))}
                  className="border-zinc-300 dark:border-zinc-600"
                />
                <label htmlFor="nc-is-bold" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  加粗
                </label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">排版方向</label>
              <Select
                value={printSettings.layout}
                onValueChange={(val) => setPrintSettings((prev) => ({ ...prev, layout: val as 'horizontal' | 'vertical' }))}
                items={[
                  { value: 'horizontal', label: '横排' },
                  { value: 'vertical', label: '竖排' },
                ]}
              >
                <SelectTrigger aria-label="排版方向" className="w-full">
                  <SelectValue placeholder="选择排版方向" />
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
                items={[
                  { value: 'left', label: '居左/靠上' },
                  { value: 'center', label: '居中' },
                  { value: 'right', label: '居右/靠下' },
                ]}
              >
                <SelectTrigger aria-label="对齐方式" className="w-full">
                  <SelectValue placeholder="选择对齐方式" />
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
              <Input
                type="number"
                aria-label="姓名大小 (px)"
                value={printSettings.fontSize}
                onChange={(e) =>
                  setPrintSettings((prev) => ({ ...prev, fontSize: parseInt(e.target.value) || 32 }))
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">字体颜色</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  aria-label="字体颜色"
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
                  aria-label="背景颜色"
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="nc-show-department"
                checked={printSettings.showDepartment}
                onCheckedChange={(c) => setPrintSettings((prev) => ({ ...prev, showDepartment: c === true }))}
                className="border-zinc-300 dark:border-zinc-600"
              />
              <label htmlFor="nc-show-department" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                显示部门
              </label>
            </div>
            {printSettings.showDepartment && (
              <div className="pl-6">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  部门字号 (px)
                </label>
                <Input
                  type="number"
                  aria-label="部门字号 (px)"
                  value={printSettings.departmentFontSize}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({ ...prev, departmentFontSize: parseInt(e.target.value) || 14 }))
                  }
                />
              </div>
            )}

            <div className="flex items-center space-x-2 mt-2">
              <Checkbox
                id="nc-show-role"
                checked={printSettings.showRole}
                onCheckedChange={(c) => setPrintSettings((prev) => ({ ...prev, showRole: c === true }))}
                className="border-zinc-300 dark:border-zinc-600"
              />
              <label htmlFor="nc-show-role" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                显示职位
              </label>
            </div>
            {printSettings.showRole && (
              <div className="pl-6">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  职位字号 (px)
                </label>
                <Input
                  type="number"
                  aria-label="职位字号 (px)"
                  value={printSettings.roleFontSize}
                  onChange={(e) =>
                    setPrintSettings((prev) => ({ ...prev, roleFontSize: parseInt(e.target.value) || 14 }))
                  }
                />
              </div>
            )}

            <div className="flex items-center space-x-2 mt-2">
              <Checkbox
                id="nc-show-company-name"
                checked={printSettings.showCompanyName}
                onCheckedChange={(c) => setPrintSettings((prev) => ({ ...prev, showCompanyName: c === true }))}
                className="border-zinc-300 dark:border-zinc-600"
              />
              <label
                htmlFor="nc-show-company-name"
                className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                显示公司名称
              </label>
            </div>
            {printSettings.showCompanyName && (
              <div className="pl-6 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    公司名称
                  </label>
                  <Input
                    type="text"
                    aria-label="公司名称"
                    value={printSettings.companyName}
                    onChange={(e) => setPrintSettings((prev) => ({ ...prev, companyName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    公司名称字号 (px)
                  </label>
                  <Input
                    type="number"
                    aria-label="公司名称字号 (px)"
                    value={printSettings.companyNameFontSize}
                    onChange={(e) =>
                      setPrintSettings((prev) => ({ ...prev, companyNameFontSize: parseInt(e.target.value) || 16 }))
                    }
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
