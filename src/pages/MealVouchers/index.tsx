import React, { useMemo, useState } from 'react';
import { Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PreviewZoomControl } from '@/components/PreviewZoomControl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConfirm } from '@/hooks/useConfirm';
import { usePreviewZoom, iframeZoomStyle } from '@/hooks/usePreviewZoom';
import { useServerPrefs } from '@/hooks/useServerPrefs';
import { printInIframe } from '@/utils/printWindow';
import {
  buildVoucherHtml,
  DEFAULT_SPEC,
  findOverlap,
  formatRecordRange,
  layoutFacts,
  nextStartNo,
  PAPER_SIZES,
  PERIOD_BASE_FONT_PT,
  voucherNumbers,
  type VoucherDate,
  type VoucherPrintRecord,
  type VoucherSpec,
} from './voucher';
import { useVoucherHistory } from './useVoucherHistory';

/**
 * 工作餐券打印页。编号、号段台账与版面在 ./voucher.ts（预览与打印共用一份 HTML），这里只管设置表单。
 * 券面参数与打印台账都跟着账号走（saved-items），换设备/刷新都不丢。
 */

const TEXT_FIELDS: Array<{ key: keyof VoucherSpec; label: string }> = [
  { key: 'org', label: '机构名（券顶）' },
  { key: 'title', label: '券名与面额' },
  { key: 'place', label: '使用地点' },
  { key: 'note', label: '使用说明' },
];

const DATE_PARTS: Array<{ key: keyof VoucherDate; label: string; max: number }> = [
  { key: 'year', label: '年', max: 4 },
  { key: 'month', label: '月', max: 2 },
  { key: 'day', label: '日', max: 2 },
];

const NUM_FIELDS: Array<{ key: keyof VoucherSpec; label: string; min: number; max: number }> = [
  { key: 'startNo', label: '起始编号', min: 1, max: 999999 },
  { key: 'count', label: '打印张数', min: 1, max: 1000 },
  { key: 'pad', label: '编号位数', min: 1, max: 8 },
  { key: 'cols', label: '每页列数', min: 1, max: 4 },
  { key: 'perCol', label: '每列张数（号段步长）', min: 1, max: 500 },
  { key: 'gutterMm', label: '切断槽宽 mm', min: 0, max: 20 },
];

const formatAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
};

export default function MealVouchers() {
  const { value: spec, setValue: patch, saving } = useServerPrefs<VoucherSpec>(
    'meal-voucher-spec',
    DEFAULT_SPEC
  );
  const history = useVoucherHistory();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const { zoom, change: changeZoom, reset: resetZoom } = usePreviewZoom('meal-vouchers');

  const numbers = useMemo(() => voucherNumbers(spec), [spec]);
  const html = useMemo(() => buildVoucherHtml(spec, numbers), [spec, numbers]);
  const facts = useMemo(() => layoutFacts(spec), [spec]);
  const conflict = useMemo(() => findOverlap(spec, history.records), [spec, history.records]);
  const suggestedStart = nextStartNo(history.records, spec.startNo);

  const num = (key: keyof VoucherSpec, min: number, max: number, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    patch({ [key]: Math.min(max, Math.max(min, Math.round(v))) } as Partial<VoucherSpec>);
  };

  const patchDate = (which: 'periodFrom' | 'periodTo', part: keyof VoucherDate, raw: string) => {
    const max = DATE_PARTS.find((p) => p.key === part)?.max ?? 2;
    patch({
      [which]: { ...spec[which], [part]: (raw ?? '').replace(/\D/g, '').slice(0, max) },
    } as Partial<VoucherSpec>);
  };

  const removeRecord = async (rec: VoucherPrintRecord) => {
    const ok = await confirm({
      title: '删除这条打印记录？',
      description: `号段 ${formatRecordRange(rec, spec.pad)}（${formatAt(rec.at)}）会从台账里移除，之后印到同号段不再提示重叠。`,
      confirmText: '删除',
      variant: 'danger',
    });
    if (ok) await history.remove(rec.id);
  };

  const print = async () => {
    setBusy(true);
    try {
      await printInIframe(html);
      await history.record(spec);
    } catch {
      toast.error('打印未能启动，请检查浏览器弹窗设置后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col space-y-4">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">工作餐券</h1>
          <p className="page-subtitle">按在用母版排版，券面文字、号段与切断槽均可设置</p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        <aside className="w-80 flex-shrink-0 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">券面信息</h3>
          <div className="space-y-3">
            {TEXT_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{f.label}</span>
                <Input
                  value={String(spec[f.key])}
                  onChange={(e) => patch({ [f.key]: e.target.value } as Partial<VoucherSpec>)}
                />
              </label>
            ))}

            <div>
              <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                使用时间（留空的段落印成手写占位）
              </span>
              {(['periodFrom', 'periodTo'] as const).map((which, i) => (
                <div key={which} className="mb-2 flex items-center gap-2 last:mb-0">
                  <span className="w-4 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {i === 0 ? '起' : '止'}
                  </span>
                  {DATE_PARTS.map((p) => (
                    <Input
                      key={p.key}
                      aria-label={`使用时间${i === 0 ? '起始' : '截止'}${p.label}`}
                      inputMode="numeric"
                      placeholder={`0${p.label}`}
                      className="w-full"
                      value={spec[which][p.key]}
                      onChange={(e) => patchDate(which, p.key, e.target.value)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <h3 className="mb-3 mt-5 text-sm font-semibold text-zinc-900 dark:text-white">编号与版式</h3>
          <div className="grid grid-cols-2 gap-3">
            {NUM_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{f.label}</span>
                <Input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={String(spec[f.key])}
                  onChange={(e) => num(f.key, f.min, f.max, e.target.value)}
                />
              </label>
            ))}
          </div>
          {suggestedStart > spec.startNo && (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="mt-1 h-auto px-0"
              onClick={() => patch({ startNo: suggestedStart })}
            >
              接续上一批：起始号改到 {suggestedStart}
            </Button>
          )}
          <div className="mt-3">
            <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">纸张</span>
            <Select value={spec.paperSize} onValueChange={(v) => patch({ paperSize: String(v) })}>
              <SelectTrigger aria-label="纸张">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={spec.splitByColumn}
              onChange={(e) => patch({ splitByColumn: e.target.checked })}
            />
            分列号段（右列 = 左列 + 每列张数，同 Excel 母版）
          </label>

          <p className="mt-3 text-xs text-muted-foreground">
            共 {numbers.length} 张 · 编号 {numbers[0]} 至 {numbers[numbers.length - 1]} · 券宽{' '}
            {facts.voucherWidthMm}mm · 每页 {facts.perPage} 张 × {facts.pages} 页
            {facts.periodFontPt < PERIOD_BASE_FONT_PT
              ? ` · 使用时间按 ${facts.periodFontPt}pt 排版`
              : ''}
            {saving ? ' · 券面设置保存中' : ''}
          </p>
          {facts.tooNarrow && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              最长一行约 {facts.longestLineMm}mm，已超过券宽 {facts.voucherWidthMm}mm，
              会被裁掉：换大纸、减每页列数，或缩短券面文字。
            </p>
          )}
          {facts.periodTooWide && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              使用时间整行缩到 {facts.periodFontPt}pt 仍放不下券宽 {facts.voucherWidthMm}mm，
              会裁掉行尾：换大纸、减列数，或只填一侧的年份。
            </p>
          )}
          {conflict && (
            <p
              role="alert"
              className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
            >
              本批号段与 {formatAt(conflict.at)} 打印的 NO.
              {formatRecordRange(conflict, spec.pad)} 重叠，确认不是重复打印再按。
            </p>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold text-zinc-900 dark:text-white">
            打印记录
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {history.records.length} 批
            </span>
          </h3>
          {history.loading ? (
            <p className="text-xs text-muted-foreground">读取中…</p>
          ) : history.records.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有打印记录，打印一次就会记下本批号段。</p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
              {history.records.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200/80 px-2 py-1.5 text-xs dark:border-zinc-700/60"
                >
                  <span className="flex-1 tabular-nums text-zinc-800 dark:text-zinc-200">
                    NO.{formatRecordRange(r, spec.pad)} · {r.count} 张
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatAt(r.at)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`删除 ${formatAt(r.at)} 打印的 NO.${formatRecordRange(r, spec.pad)}`}
                    onClick={() => void removeRecord(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button className="mt-4 w-full" disabled={busy} onClick={() => void print()}>
            <Printer className="mr-2 h-4 w-4" />
            {busy ? '打印中…' : '打印餐券'}
          </Button>
        </aside>

        {/* 预览样式对齐会议台卡：灰底 + 一张纸一个白卡（页码与纸张标注在 iframe 内按 screen 媒体渲染），
            iframe 里的版面与打印产物是同一份 HTML，所见即所打 */}
        {/* 预览样式对齐会议台卡：灰底 + 一张纸一个白卡（纸张与页码标注在 iframe 内按 screen 媒体渲染），
            iframe 里的版面与打印产物是同一份 HTML，所见即所打。
            角标与缩放放在纸面上方的工具栏里，而不是叠在纸上：叠着的话一改缩放比例，
            外层像素的角标就会盖住随缩放走的纸张标注。 */}
        <section
          role="region"
          aria-label="餐券预览区"
          className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/70 bg-white/70 px-3 py-1.5 dark:border-zinc-700/60 dark:bg-zinc-800/60">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              打印预览 ({facts.pages}页)
            </span>
            <PreviewZoomControl zoom={zoom} onChange={changeZoom} onReset={resetZoom} />
          </div>
          <div className="relative flex-1 min-h-0">
            <iframe
              title="餐券预览"
              className="h-full w-full"
              /* 只缩放渲染：iframe 内部视口 = 指定尺寸，纸面仍是 210mm 实际尺寸，打印产物一个字节都不变 */
              style={iframeZoomStyle(zoom)}
              sandbox="allow-same-origin"
              srcDoc={html}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
