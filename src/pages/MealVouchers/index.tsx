import React, { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServerPrefs } from '@/hooks/useServerPrefs';
import { printInIframe } from '@/utils/printWindow';
import { buildVoucherHtml, DEFAULT_SPEC, voucherNumbers, type VoucherSpec } from './voucher';

/**
 * 工作餐券打印页。编号与版面在 ./voucher.ts（预览与打印共用一份 HTML），这里只管设置表单。
 * 券面参数跟着账号走（saved-items 一份），换设备/刷新都不丢。
 */

const TEXT_FIELDS: Array<{ key: keyof VoucherSpec; label: string }> = [
  { key: 'org', label: '机构名（券顶）' },
  { key: 'title', label: '券名与面额' },
  { key: 'period', label: '使用时间' },
  { key: 'place', label: '使用地点' },
  { key: 'note', label: '使用说明' },
];

const NUM_FIELDS: Array<{ key: keyof VoucherSpec; label: string; min: number; max: number }> = [
  { key: 'startNo', label: '起始编号', min: 1, max: 999999 },
  { key: 'count', label: '打印张数', min: 1, max: 1000 },
  { key: 'pad', label: '编号位数', min: 1, max: 8 },
  { key: 'cols', label: '每页列数', min: 1, max: 4 },
  { key: 'perCol', label: '每列张数（号段步长）', min: 1, max: 500 },
  { key: 'gutterMm', label: '切断槽宽 mm', min: 0, max: 20 },
];

export default function MealVouchers() {
  const { value: spec, setValue: patch, saving } = useServerPrefs<VoucherSpec>(
    'meal-voucher-spec',
    DEFAULT_SPEC
  );
  const numbers = useMemo(() => voucherNumbers(spec), [spec]);
  const html = useMemo(() => buildVoucherHtml(spec, numbers), [spec, numbers]);

  const num = (key: keyof VoucherSpec, min: number, max: number, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    patch({ [key]: Math.min(max, Math.max(min, Math.round(v))) } as Partial<VoucherSpec>);
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
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={spec.splitByColumn}
              onChange={(e) => patch({ splitByColumn: e.target.checked })}
            />
            分列号段（右列 = 左列 + 每列张数，同 Excel 母版）
          </label>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            共 {numbers.length} 张 · 编号 {numbers[0]} 至 {numbers[numbers.length - 1]}
            {saving ? ' · 券面设置保存中' : ' · 券面设置随账号保存'}
          </p>
          <Button
            className="mt-4 w-full"
            onClick={async () => {
              try {
                await printInIframe(html);
              } catch {
                toast.error('打印未能启动，请检查浏览器弹窗设置后重试');
              }
            }}
          >
            <Printer className="mr-2 h-4 w-4" />
            打印餐券
          </Button>
        </aside>

        {/* 预览按 A4 可印宽（201mm）出图，与打印同源；内边距留小，保证双列一屏看全 */}
        <section className="flex-1 overflow-auto rounded-xl border border-zinc-200 bg-zinc-100 p-2 dark:border-zinc-700 dark:bg-zinc-900">
          <iframe
            title="餐券预览"
            className="h-full w-full rounded bg-white"
            sandbox="allow-same-origin"
            srcDoc={html}
          />
        </section>
      </div>
    </div>
  );
}
