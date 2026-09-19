import React, { useCallback, useRef, useState } from 'react';
import { Download, FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { withAuthToken } from '@/services/api';
import {
  previewImport,
  commitImport,
  getImportJob,
  type ImportPreview,
  type ImportRowResult,
} from '@/services/userApi';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 导入成功后刷新员工列表 */
  onImported: () => void;
}

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

type Step = 'upload' | 'preview' | 'running' | 'done';

/**
 * 员工批量导入（四步）：上传 xlsx → 预览校验结果 → 确认 → 后台任务进度。
 * 模板下载、错误行高亮、重复检测说明齐备（对齐 P1 审查建议）；
 * 提交为异步任务（#16），轮询 /import/jobs/:id 展示实时进度。
 */
export default function ImportModal({ isOpen, onClose, onImported }: ImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setPreview(null);
    setProgress(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFile = useCallback(async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('请上传 .xlsx 格式文件（可下载模板）');
      return;
    }
    setIsParsing(true);
    try {
      const p = await previewImport(file);
      setPreview(p);
      setStep('preview');
      if (p.valid === 0) {
        toast.warning('没有可导入的有效行，请修正后重试');
      }
    } catch (e) {
      toast.error(errText(e, '文件解析失败'));
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    const validRows = preview.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;
    setIsCommitting(true);
    setStep('running');
    try {
      const { jobId } = await commitImport(validRows as ImportRowResult[]);
      // 轮询后台任务直至 done/error
      for (;;) {
        const job = await getImportJob(jobId);
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
      setIsCommitting(false);
    }
  }, [preview, onImported]);

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title="批量导入员工" size="4xl">
      {/* ---------- 第一步：上传 ---------- */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/50 dark:bg-brand-900/10 p-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              导入前请先下载模板，按模板格式填写员工数据（
              <span className="font-medium">姓名、身份证号、电话、部门、入职日期为必填</span>
              ）。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={withAuthToken('/api/users/import/template')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> 下载导入模板
              </a>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 self-center">
                部门需与「部门管理」中的名称一致
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isParsing}
            className="w-full rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 hover:border-brand-400 dark:hover:border-brand-500 py-10 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {isParsing ? (
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
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
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

      {/* ---------- 第二步：预览 ---------- */}
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
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5" /> 重新选择
            </Button>
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-sm" aria-label="导入预览">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">行</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">身份证号</th>
                  <th className="px-3 py-2 font-medium">部门</th>
                  <th className="px-3 py-2 font-medium">入职日期</th>
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
                      <td className="px-3 py-2 text-zinc-400 dark:text-zinc-500 tabular-nums">{row.rowNumber}</td>
                      <td className="px-3 py-2 text-zinc-900 dark:text-white">{String(row.data.name ?? '—')}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300 font-mono text-xs">
                        {typeof row.data.idCard === 'string' ? row.data.idCard : '—'}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{String(row.data.department ?? '—')}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300 tabular-nums">{String(row.data.joinDate ?? '—')}</td>
                      <td className="px-3 py-2">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 可导入
                          </span>
                        ) : (
                          <span className="inline-flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{row.errors.join('；')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={handleClose} className="btn-secondary">
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={isCommitting || validRows.length === 0}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCommitting ? '导入中…' : `确认导入 ${validRows.length} 条`}
            </button>
          </div>
        </div>
      )}

      {/* ---------- 第三步：后台导入进度 ---------- */}
      {step === 'running' && (
        <div className="py-10 flex flex-col items-center text-center">
          <RotateCcw className="w-10 h-10 text-brand-500 animate-spin mb-4" aria-hidden="true" />
          <h4 className="text-base font-semibold text-zinc-900 dark:text-white mb-1">
            正在后台导入…
          </h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4" aria-live="polite">
            {progress ? `已处理 ${progress.processed} / ${progress.total} 行` : '任务已提交，等待处理…'}
          </p>
          <div
            className="w-full max-w-md h-2 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress?.total ?? 0}
            aria-valuenow={progress?.processed ?? 0}
            aria-label="导入进度"
          >
            <div
              className="h-full bg-brand-500 transition-all duration-500"
              style={{
                width: progress && progress.total > 0
                  ? `${Math.round((progress.processed / progress.total) * 100)}%`
                  : '0%',
              }}
            />
          </div>
          <p className="mt-4 text-xs text-zinc-400">关闭本窗口不会中断后台导入任务。</p>
        </div>
      )}

      {/* ---------- 第四步：完成 ---------- */}
      {step === 'done' && result && (
        <div className="py-8 flex flex-col items-center text-center">
          <CheckCircle2 className="w-12 h-12 text-brand-500 mb-4" aria-hidden="true" />
          <h4 className="text-base font-semibold text-zinc-900 dark:text-white mb-1">导入完成</h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            成功导入 <span className="font-semibold text-brand-700 dark:text-brand-400">{result.created}</span> 名员工
            {result.skipped > 0 && <span>（{result.skipped} 条被跳过）</span>}
          </p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={reset} className="btn-secondary">
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> 继续导入
            </button>
            <button type="button" onClick={handleClose} className="btn-primary">
              完成
            </button>
          </div>
        </div>
      )}
    </BaseModal>
  );
}
