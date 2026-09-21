import { escapeHtml } from '@/utils/escapeHtml';
import { printTokensCss } from '@/styles/printTokens';
import type { DocumentSet, PrintPart, PrintSettings } from '@/types/document';

/**
 * 文件套件「一键打包打印」的版面（A4，一份一页起排）。
 *
 * 三个打印参数里真正生效的两个在这里落地：
 * - 份数 → 同一文档重复输出 N 次（每份另起一页，票头标「第 k/N 份」）
 * - 彩色/黑白 → 黑白时给该文档整段加 grayscale 滤镜，驱动拿到的即刻度就是灰版
 * - 双面 → 浏览器无法代驱动设置，只能在打印对话框里选，故不在此假装
 */

export interface PrintJobItem {
  documentId: string;
  name: string;
  settings: PrintSettings;
  /** null = 片段拉取失败（网络/权限），打印里如实标注而不是留白 */
  part: PrintPart | null;
}

/** 防御：库里存了离谱份数时不把打印队列打死 */
export const MAX_COPIES = 20;

export function buildDocumentSetPrintCss(isDoubleSided = false): string {
  // 双面时的镜像页边距与花名册/通讯录同一套做法：浏览器无法代驱动设置双面，
  // 但可以把左右页边距按奇偶页镜像，正反面装订后版心才对齐。
  const duplexCss = isDoubleSided
    ? '@page :left { margin-left: 16mm; margin-right: 10mm; } @page :right { margin-left: 10mm; margin-right: 16mm; }'
    : '';
  return `
${printTokensCss}
@page { size: A4; margin: 14mm 12mm; }
${duplexCss}
body{ margin:0; padding:16px; background:#fff; color:var(--print-strong);
  font-family:-apple-system,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif; }
.dp-job{ font-size:11px; color:var(--print-body); margin:0 0 10px; }
.dp-doc{ break-after:page; page-break-after:always; }
.dp-doc:last-child{ break-after:auto; page-break-after:auto; }
.dp-mono{ filter:grayscale(1); }
.dp-head{ display:flex; align-items:baseline; justify-content:space-between; gap:12px;
  border-bottom:1px solid var(--print-border); padding-bottom:4px; margin-bottom:8px; }
.dp-title{ font-size:13px; font-weight:600; color:var(--print-doc-title); margin:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-ticket{ font-size:10px; color:var(--print-body); white-space:nowrap; }
.dp-txt{ margin:0; font-size:11px; line-height:1.7; white-space:pre-wrap; word-break:break-word;
  font-family:inherit; }
.dp-sheet{ font-size:11px; font-weight:600; color:var(--print-heading); margin:10px 0 4px; }
.dp-table{ border-collapse:collapse; width:100%; font-size:10px; table-layout:auto; }
.dp-table th,.dp-table td{ border:1px solid var(--print-border-soft); padding:2px 5px; text-align:left;
  vertical-align:top; word-break:break-word; }
.dp-table th{ background:var(--print-muted-bg); print-color-adjust:exact; -webkit-print-color-adjust:exact;
  font-weight:600; }
.dp-page{ width:100%; display:block; margin:0 0 8px; }
.dp-note{ font-size:11px; color:#b91c1c; margin:6px 0; }
.dp-trunc{ font-size:10px; color:var(--print-soft); margin:6px 0; }
`.trim();
}

function partContent(part: PrintPart): string {
  switch (part.kind) {
    case 'text':
      return (
        `<pre class="dp-txt">${escapeHtml(part.text)}</pre>` +
        (part.truncated ? `<p class="dp-trunc">内容过长，已截断输出。</p>` : '')
      );
    case 'table':
      return part.sheets
        .map(
          (sheet) =>
            `<p class="dp-sheet">${escapeHtml(sheet.name)}</p><table class="dp-table"><tbody>` +
            sheet.rows
              .map((row, i) => {
                const cell = (v: string) =>
                  i === 0 ? `<th>${escapeHtml(v)}</th>` : `<td>${escapeHtml(v)}</td>`;
                return `<tr>${row.map(cell).join('')}</tr>`;
              })
              .join('') +
            `</tbody></table>`
        )
        .join('') +
        (part.truncated ? `<p class="dp-trunc">工作表或行数过多，仅输出前部分数据。</p>` : '');
    case 'pages':
      return (
        part.pages.map((src) => `<img class="dp-page" src="${src}" alt="">`).join('') +
        (part.truncated ? `<p class="dp-trunc">页数较多，仅输出前面若干页。</p>` : '')
      );
    case 'unsupported':
      return `<p class="dp-note">${escapeHtml(part.note)}</p>`;
  }
}

function documentBlock(
  item: PrintJobItem,
  index: number,
  copyNo: number,
  copies: number,
  jobLine: string
): string {
  const settings = item.settings;
  const colorLabel = settings.color ? '彩色' : '黑白';
  const ticket =
    copies > 1 ? `第 ${copyNo}/${copies} 份 · ${colorLabel}` : `${colorLabel} · ${copies} 份`;
  const body =
    item.part === null
      ? `<p class="dp-note">内容读取失败，未输出。可单文件下载后本地打印。</p>`
      : partContent(item.part);
  return (
    `<section class="dp-doc${settings.color ? '' : ' dp-mono'}">` +
    (jobLine ? `<p class="dp-job">${jobLine}</p>` : '') +
    `<div class="dp-head"><h2 class="dp-title">${index + 1}. ${escapeHtml(item.name)}</h2>` +
    `<span class="dp-ticket">${escapeHtml(ticket)}</span></div>` +
    body +
    `</section>`
  );
}

/**
 * @param printedAt 打印时间文本（由调用方给，便于测试稳定）
 */
export function buildDocumentSetPrintHtml(
  set: Pick<DocumentSet, 'name'>,
  items: PrintJobItem[],
  printedAt: string
): string {
  const jobLine = escapeHtml(
    `${set.name} · 共 ${items.length} 份文件 · 打印于 ${printedAt}`
  );
  const css = buildDocumentSetPrintCss(items.some((i) => i.settings.duplex));
  const sections = items
    .map((item, index) => {
      const copies = Math.max(1, Math.min(Number(item.settings.copies) || 1, MAX_COPIES));
      const blocks: string[] = [];
      for (let i = 0; i < copies; i++) {
        blocks.push(documentBlock(item, index, i + 1, copies, i === 0 ? jobLine : ''));
      }
      return blocks.join('');
    })
    .join('');
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(set.name)}</title>` +
    `<style>${css}</style></head><body>${sections}</body></html>`
  );
}
