import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  applyBulk,
  computeCounts,
  isRowSelectable,
  matchesFilter,
  rowsToImport,
  PREVIEW_FILTERS,
} from '../lib/importSelection';
import type { PreviewFilter } from '../lib/importSelection';

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
  /** 跳去「异常分析」：导入只是第一步，判定要到那边点「一键分析异常」 */
  onGoAnalyze?: () => void;
}

/**
 * 打卡记录批量导入（四步）：选文件 → 服务端解析预览 → 确认 → 后台任务进度。
 *
 * 解析放服务端（exceljs），所以这里只发原始字节；落库走 (工号,日期,时间) 唯一索引，
 * 同一张表反复导入是幂等的，重复行计入"跳过"而不是造出双份打卡。
 */
export default function PunchImportDialog({ isOpen, onClose, initialFile, onImported, onGoAnalyze }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<PunchImportPreview | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  /** 逐行勾选：存的是行号，集合里没有 = 未勾中。预览出来后默认全选所有可导入的行 */
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setPreview(null);
    setProgress(null);
    setResult(null);
    setSelected(new Set());
    setPreviewFilter('all');
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
      // 默认勾上所有"可导入"行 —— 与旧行为一致（全导），用户再按需取消。
      // 重复行与错误行不进集合：它们本来也不会被送去导入（见 lib/importSelection 注释）
      setSelected(new Set(p.rows.filter(isRowSelectable).map((r) => r.rowNumber)));
      setPreviewFilter('all');
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
    // 只送勾中的行。重复行/错误行即使被塞进集合也会在这里被剔除（isRowSelectable），
    // 与改动前的 filter(errors.length === 0) 逐字一致
    const validRows = rowsToImport(preview.rows, selected);
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
  }, [preview, selected, onImported]);

  const counts = useMemo(
    () => (preview ? computeCounts(preview.rows, previewFilter, selected) : null),
    [preview, previewFilter, selected]
  );
  const visibleRows = useMemo(
    () => (preview ? preview.rows.filter((r) => matchesFilter(r, previewFilter)) : []),
    [preview, previewFilter]
  );
  const toggleRow = useCallback((rowNumber: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }, []);
  const bulk = useCallback(
    (action: 'all' | 'none' | 'invert') => {
      if (!preview) return;
      setSelected((prev) => applyBulk(preview.rows, previewFilter, action, prev));
    },
    [preview, previewFilter]
  );

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
              两种表都能直接上传：企业微信导出的横排表（一行一人、一列一天），或标准模板（一行一条打卡）。
              标准模板需含「日期」「时间」列，工号与姓名至少填一项（工号优先，姓名重名时必须填工号）。
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
          {/* 说清这张表是怎么读的 —— 横排表会自动拆成一行一条，日期跨度一并显示 */}
          {preview.layout && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {preview.layout.layout === 'wide' ? '识别为企业微信横排表' : '识别为标准模板'}
              </span>
              <span className="text-muted-foreground ml-2">{preview.layout.reason}</span>
              {preview.layout.detected && (
                <span className="text-muted-foreground ml-2">
                  （{preview.layout.detected.dateColumns} 天：
                  {preview.layout.detected.firstDate} ~ {preview.layout.detected.lastDate}
                  ，共 {preview.layout.detected.people} 人；已自动拆成一行一条打卡）
                </span>
              )}
            </div>
          )}

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

          {/* 逐行勾选：筛选 + 批量。5000 行时靠"只看问题/重复"缩小范围再批量取消，
              而不是让人在一张长表里一个个点 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div
              className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800"
              role="group"
              aria-label="筛选预览行"
            >
              {PREVIEW_FILTERS.map((f) => {
                const isActive = previewFilter === f.id;
                const n =
                  f.id === 'all'
                    ? preview.total
                    : f.id === 'problem'
                      ? preview.invalid + preview.duplicates
                      : f.id === 'duplicate'
                        ? preview.duplicates
                        : preview.valid;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setPreviewFilter(f.id)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200',
                      isActive
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                        : 'text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100',
                    ].join(' ')}
                  >
                    {f.label}
                    <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-2xs text-muted-foreground">对当前筛选：</span>
              <Button type="button" variant="ghost" size="xs" className="h-6 px-2 text-xs" onClick={() => bulk('all')}>
                全选
              </Button>
              <Button type="button" variant="ghost" size="xs" className="h-6 px-2 text-xs" onClick={() => bulk('none')}>
                全不选
              </Button>
              <Button type="button" variant="ghost" size="xs" className="h-6 px-2 text-xs" onClick={() => bulk('invert')}>
                反选
              </Button>
            </div>

            <div className="flex-1" />
            {counts && counts.deselected > 0 && (
              <span className="text-2xs text-amber-700 dark:text-amber-400 tabular-nums">
                已取消 {counts.deselected} 行
              </span>
            )}
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-sm" aria-label="导入预览">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs text-muted-foreground">
                <tr>
                  <th className="w-9 px-3 py-2">
                    {counts && counts.visibleSelectable > 0 ? (
                      <input
                        type="checkbox"
                        aria-label="全选当前筛选下的可导入行"
                        checked={counts.allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = counts.someVisibleSelected;
                        }}
                        onChange={() => bulk(counts.allVisibleSelected ? 'none' : 'all')}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                    ) : (
                      <span className="block h-4" />
                    )}
                  </th>
                  <th className="px-3 py-2 font-medium">行</th>
                  <th className="px-3 py-2 font-medium">工号</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">日期</th>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">校验结果</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      当前筛选下没有行
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const selectable = isRowSelectable(row);
                    const checked = selected.has(row.rowNumber);
                    return (
                      <tr
                        key={row.rowNumber}
                        className={`border-t border-zinc-100 dark:border-zinc-800 ${
                          row.duplicate
                            ? 'bg-amber-50/40 dark:bg-amber-500/5'
                            : row.errors.length > 0
                              ? 'bg-red-50/40 dark:bg-red-900/10'
                              : checked
                                ? ''
                                : 'opacity-60'
                        }`}
                      >
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!selectable}
                            onChange={() => toggleRow(row.rowNumber)}
                            aria-label={`导入第 ${row.rowNumber} 行${row.data.employeeId || ''}`}
                            className="h-4 w-4 accent-[var(--primary)] disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2 text-zinc-400 tabular-nums">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                          {row.data.employeeId || '—'}
                        </td>
                        <td className="px-3 py-2 text-zinc-900 dark:text-white">{row.data.employeeName || '—'}</td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300 tabular-nums">{row.data.date || '—'}</td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300 tabular-nums">{row.data.time || '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.errors.length === 0 ? (
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
                  })
                )}
              </tbody>
            </table>
          </div>

          {counts && (
            <p className="text-2xs text-muted-foreground">
              将导入 <span className="tabular-nums text-brand-700 dark:text-brand-300">{counts.willImport}</span> 行新记录
              {counts.willImportHidden > 0 && <span className="tabular-nums">（另有 {counts.willImportHidden} 行已勾选但被当前筛选隐藏）</span>}
              ；库中已存在将跳过 <span className="tabular-nums">{counts.duplicates}</span> 行
              {counts.invalid > 0 && <span className="tabular-nums">；校验错误 {counts.invalid} 行</span>}
              {counts.deselected > 0 && <span className="tabular-nums text-amber-700 dark:text-amber-400">；已取消 {counts.deselected} 行</span>}。
              <span className="ml-1">
                重复行不可勾选 —— 它与库中那一行内容完全相同，导入与否结果一致。
              </span>
            </p>
          )}

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
            <Button
              type="button"
              onClick={() => void handleCommit()}
              disabled={committing || (counts?.willImport ?? 0) === 0}
            >
              {committing ? <RotateCcw className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
              确认导入 {counts?.willImport ?? 0} 行
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
          <p className="text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
            导入只是第一步：判定要去「异常分析」点「一键分析异常」才会出来。
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              关闭
            </Button>
            {onGoAnalyze && (
              <Button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                  onGoAnalyze();
                }}
              >
                去分析异常
              </Button>
            )}
          </div>
        </div>
      )}
    </BaseModal>
  );
}
