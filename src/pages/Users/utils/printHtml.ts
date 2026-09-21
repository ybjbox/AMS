import { escapeHtml } from '@/utils/escapeHtml';
import type { User } from '@/types';
import { printTokensCss } from '@/styles/printTokens';

/** 档案标签打印：构建完整打印文档 HTML。所有用户字段经 escapeHtml 编码。 */
export function buildLabelPrintHtml(user: User): string {
  const department = escapeHtml(user.department);
  const name = escapeHtml(user.name);
  const role = escapeHtml(user.role);
  const phone = escapeHtml(user.phone);
  return `<html><head><title>打印档案标签</title><style>${printTokensCss}
@page { size: 17cm 4cm; margin: 0; }
body { margin: 0; padding: 0; width: 17cm; height: 4cm; display: flex; align-items: center; justify-content: center; font-family: "SimSun", "STSong", serif; }
.label-container { width: 16.6cm; height: 3.6cm; box-sizing: border-box; padding: 0.3cm 0.5cm; display: flex; flex-direction: column; justify-content: flex-start; border: 1px solid var(--print-border-strong); }
.row { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; margin-bottom: 0.3cm; }
.text-item { font-size: 32px; letter-spacing: 1px; }
.dept { flex: 1; text-align: left; }
.name { flex: 1; text-align: center; }
.role { flex: 1; text-align: right; }
.phone { font-size: 32px; letter-spacing: 1px; text-align: left; }
</style></head><body>
<div class="label-container">
  <div class="row">
    <div class="text-item dept">${department}</div>
    <div class="text-item name">${name}</div>
    <div class="text-item role">${role}</div>
  </div>
  <div class="row">
    <div class="phone">${phone}</div>
  </div>
</div>
</body></html>`;
}

/**
 * 联系卡打印：name 经编码；bodyHtml 来自 React 渲染的 DOM（innerHTML 已被 React 转义，安全透传）。
 *
 * 样式选择器刻意跟随档案弹窗实际渲染出来的类名（bg-zinc-50 / text-zinc-500 / …），
 * 因为打印文档是独立 document，拿不到主应用的 Tailwind；取值与 printTokens 一一对应。
 */
export function buildContactCardPrintHtml(name: string, bodyHtml: string): string {
  const safeName = escapeHtml(name);
  return `<html><head><title>打印联系卡</title><style>${printTokensCss}
body { font-family: sans-serif; padding: 20px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.bg-zinc-50 { background-color: var(--print-muted-bg); padding: 15px; border-radius: 8px; margin-bottom: 15px; }
.flex { display: flex; justify-content: space-between; margin-bottom: 8px; }
.text-sm { font-size: 14px; }
.text-zinc-500 { color: var(--print-muted-fg); }
.font-medium { font-weight: 500; }
h4 { margin-top: 0; margin-bottom: 10px; color: var(--print-heading); }
@media print { .md\\:col-span-2 { grid-column: span 2; } }
</style></head><body>
<h2>${safeName} - 联系卡</h2>
${bodyHtml}
</body></html>`;
}

export interface RosterPrintOptions {
  title: string;
  paperSize: string;
  orientation: string;
  isDoubleSided: boolean;
}

/** 花名册打印：title/纸张参数经编码；bodyHtml 来自 React 渲染的 DOM（innerHTML 已被 React 转义，安全透传）。 */
export function buildRosterPrintHtml(bodyHtml: string, opts: RosterPrintOptions): string {
  const title = escapeHtml(opts.title);
  const paperSize = escapeHtml(opts.paperSize);
  const orientation = escapeHtml(opts.orientation);
  const doubleSided = opts.isDoubleSided
    ? '@page :left { margin-left: 15mm; margin-right: 10mm; } @page :right { margin-left: 10mm; margin-right: 15mm; }'
    : '';
  return `<html><head><title>${title}</title><style>${printTokensCss}
@page { size: ${paperSize} ${orientation} margin: 10mm; }
${doubleSided}
body { font-family: 'SimSun', 'Songti SC', serif; font-size: 10pt; color: var(--print-strong); }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { border: 1px solid var(--print-border-strong); padding: 4px 6px; text-align: left; word-break: break-all; }
th { background-color: var(--print-muted-bg) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; }
h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; font-weight: bold; }
</style></head><body>${bodyHtml}</body></html>`;
}

/** 通讯录打印：同 buildRosterPrintHtml。 */
export function buildAddressBookPrintHtml(bodyHtml: string, opts: RosterPrintOptions): string {
  const title = escapeHtml(opts.title);
  const paperSize = escapeHtml(opts.paperSize);
  const orientation = escapeHtml(opts.orientation);
  const doubleSided = opts.isDoubleSided
    ? '@page :left { margin-left: 15mm; margin-right: 10mm; } @page :right { margin-left: 10mm; margin-right: 15mm; }'
    : '';
  return `<html><head><title>${title}</title><style>${printTokensCss}
@page { size: ${paperSize} ${orientation} margin: 10mm; }
${doubleSided}
body { font-family: 'SimSun', 'Songti SC', serif; font-size: 10pt; color: var(--print-strong); }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { border: 1px solid var(--print-border-strong); padding: 4px 6px; text-align: left; word-break: break-all; }
th { background-color: var(--print-muted-bg) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; }
h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; font-weight: bold; }
</style></head><body>${bodyHtml}</body></html>`;
}
