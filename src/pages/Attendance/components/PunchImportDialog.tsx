import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, RotateCcw, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import {
  commitPunchImport,
  getPunchImportJob,
  punchImportTemplateUrl,
  previewPunchImport,
  type PunchImportPreview,
} from '@/services/attendanceApi';

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

type Step = 'upload' | 'preview' | 'running' | 'done';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 由外部（考勤页的拖拽区）选好的文件：传入则直接进预览步 */
  initialFile?: File | null;
  /** 导入完成后刷新打卡记录列表 */
  onImported: () => void;
}

/**
 * 打卡记录批量导入（四步）：选文件 → 服务端解析预览 → 确认 → 后台任务进度。
 *
 * 解析放服务端（exceljs），所以这里只发原始字节；落库走 (工号,日期,时间) 唯一索引，
 * 同一张表反复导入是幂等的，重复行计入"跳过"而不是造出双份打卡。
 */
export default function PunchImportDialog({ isOpen, onClose, initialFile, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<PunchImportPreview | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setPreview(null);
    setProgress(null);
    setResult(null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('请上传 .xlsx 格式文件（可先下载模板）');
      return;
    }
    setParsing(true);
    try {
      const p = await previewPunchImport(file);
      setPreview(p);
      setStep('preview');
      if (p.valid === 0) toast.warning('没有可导入的有效行，请修正后重试');
    } catch (e) {
      toast.error(errText(e, '文件解析失败'));
    } finally {
      setParsing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && initialFile) void handleFile(initialFile);
  }, [isOpen, initialFile, handleFile]);

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    const validRows = preview.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;
    setCommitting(true);
    setStep('running');
    try {
      const { jobId } = await commitPunchImport(validRows);
      // 轮询后台任务直至 done/error（与员工导入同一套作业通道）
      for (;;) {
        const job = await getPunchImportJob(jobId);
        setProgress({ processed: job.processed, total: job.total });
        if (job.status === 'done') {
          setResult({ created: job.created, skipped: job.skipped });
          setStep('done');
          onImported();
          break;
        }
        if (job.status === 'error') {
          toast.error(`导入任务出错：${job.error || '未知原因'}`);
          setStep('preview');
          break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      toast.error(errText(e, '导入失败'));
      setStep('preview');
    } finally {
      setCommitting(false);
    }
  }, [preview, onImported]);

  const validCount = preview?.rows.filter((r) => r.errors.length === 0).length ?? 0;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="批量导入打卡记录"
      size="4xl"
    >
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/50 dark:bg-brand-900/10 p-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              请按模板填写：<span className="font-medium">日期 YYYY-MM-DD、时间 HH:MM</span>
              ，工号与姓名至少填一项（工号优先，姓名重名时必须填工号）。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={punchImportTemplateUrl()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> 下载导入模板
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 hover:border-brand-400 dark:hover:border-brand-500 py-10 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {parsing ? (
              <>
                <RotateCcw className="w-8 h-8 text-brand-500 animate-spin" aria-hidden="true" />
                <span className="text-sm text-zinc-600 dark:text-zinc-300">解析中…</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 text-zinc-400" aria-hidden="true" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  点击选择 .xlsx 文件
                </span>
                <span className="text-xs text-muted-foreground">
                  单次最多 5000 行，解析后先预览再导入
                </span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            aria-label="选择导入文件"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium">
              共 {preview.total} 行
            </span>
            <span className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium">
              可导入 {preview.valid}
            </span>
            {preview.invalid > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-medium">
                错误 {preview.invalid}
              </span>
            )}
            {preview.duplicates > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                重复 {preview.duplicates}
              </span>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={reset} disabled={committing}>
              <RotateCcw className="w-3.5 h-3.5" /> 重新选择
            </Button>
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-sm" aria-label="导入预览">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">行</th>
                  <th className="px-3 py-2 font-medium">工号</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">日期</th>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">校验结果</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const ok = row.errors.length === 0;
                  return (
                    <tr
                      key={row.rowNumber}
                      className={`border-t border-zinc-100 dark:border-zinc-800 ${ok ? '' : 'bg-red-50/40 dark:bg-red-900/10'}`}
                    >
                      <td className="px-3 py-2 text-zinc-400 tabular-nums">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                        {row.data.employeeId || '—'}
                      </td>
                      <td className="px-3 py-2 text-zinc-900 dark:text-white">{row.data.employeeName || '—'}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300 tabular-nums">{row.data.date || '—'}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300 tabular-nums">{row.data.time || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> 可导入
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 ${row.duplicate ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}`}
                          >
                            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            {row.errors.join('；')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={committing}
            >
              取消
            </Button>
            <Button type="button" onClick={() => void handleCommit()} disabled={committing || validCount === 0}>
              {committing ? <RotateCcw className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
              确认导入 {validCount} 行
            </Button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div className="py-10 text-center space-y-3">
          <RotateCcw className="w-8 h-8 mx-auto text-brand-500 animate-spin" aria-hidden="true" />
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            正在后台写入… {progress ? `${progress.processed} / ${progress.total}` : ''}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            同一分钟已存在的记录会被跳过，不会重复计入月报。
          </p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="py-10 text-center space-y-3">
          <CheckCircle2 className="w-9 h-9 mx-auto text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <p className="text-sm text-zinc-900 dark:text-white">
            导入完成：新增 {result.created} 条，跳过 {result.skipped} 条。
          </p>
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
            关闭
          </Button>
        </div>
      )}
    </BaseModal>
  );
}
