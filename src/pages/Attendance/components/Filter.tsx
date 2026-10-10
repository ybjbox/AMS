import { Permission } from "@/components/Permission";
import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Search, AlertTriangle } from 'lucide-react';
import { punchImportTemplateUrl } from '@/services/attendanceApi';
import PunchImportDialog from './PunchImportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type FilterProps = Pick<
  UseAttendanceReturn,
  | 'activeTab'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'records'
  | 'analyzeAnomalies'
  | 'fetchData'
  | 'hasPermission'
  | 'setActiveTab'
>;

export default function Filter({
  activeTab,
  searchQuery,
  setSearchQuery,
  records,
  analyzeAnomalies,
  fetchData,
  hasPermission,
  setActiveTab,
}: FilterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (!file) return;
      // 解析与校验都在服务端（/api/attendance/records/import），这里只把文件交给导入向导
      setImportFile(file);
      setImportOpen(true);
    },
    []
  );

  const handleAnalyze = useCallback(async () => {
    // 只需要打卡记录：对班可以来自部门工作时段（不需要排班字典），没有卡才真的无从判定
    if (records.length === 0) {
      toast.warning('还没有打卡记录，先去「打卡记录」导入或等待企业微信同步');
      return;
    }

    // store 动作内部调用 POST /attendance/analyze（真实分析并持久化）。
    // 它不抛异常（错误写进 state.error 并作为返回值），所以必须看返回值再报成功 ——
    // 否则后端 403/500 时界面照样弹「异常分析完成」。
    const failure = await analyzeAnomalies();
    if (failure) toast.error(failure);
    else toast.success('异常分析完成');
  }, [records.length, analyzeAnomalies]);

  return (
    <>
      {activeTab === 'records' && hasPermission('attendance:manage') && (
        <div className="mb-6 bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-sm">
          <div className="w-full max-w-2xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">导入打卡记录</h2>
            <p className="text-sm text-muted-foreground mb-4">
              企业微信导出的横排表（一行一人、一列一天）可直接上传；标准模板是一行一条打卡，需含「日期」「时间」列，工号或姓名至少填一项（
              <a
                href={punchImportTemplateUrl()}
                className="text-brand-700 dark:text-brand-300 hover:underline"
              >
                下载模板
              </a>
              ）。上传后先预览校验结果再确认导入；同一员工同一分钟的重复行会自动跳过。
            </p>
            {/* 用 button 而不是带 onClick 的 div：键盘能 Tab 过去、读屏能念出名字。
                真正的 <input type=file> 必须放在 button 外面（按钮里不能嵌套交互元素）。 */}
            <button
              type="button"
              className="w-full border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-zinc-400" aria-hidden="true" />
              <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                点击选择 Excel 文件
              </span>
              <span className="block text-xs text-muted-foreground mt-1">支持 .xlsx，单次最多 5000 行</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx"
              aria-label="上传 Excel 打卡记录"
              className="hidden"
            />
          </div>
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="mb-6 bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center">
            <Permission code="attendance:manage">
              <Button type="button" size="lg" className="px-5" onClick={handleAnalyze}>
                <AlertTriangle />
                一键分析异常
              </Button>
            </Permission>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="搜索姓名或工号…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10"
            />
          </div>
        </div>
      )}

      <PunchImportDialog
        isOpen={importOpen}
        initialFile={importFile}
        onClose={() => {
          setImportOpen(false);
          setImportFile(null);
        }}
        onImported={() => void fetchData()}
        onGoAnalyze={() => setActiveTab('anomalies')}
      />
    </>
  );
}
