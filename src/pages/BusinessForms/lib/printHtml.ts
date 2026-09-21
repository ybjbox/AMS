import { escapeHtml } from '@/utils/escapeHtml';
import { LAYOUT, FORM_ROWS, cellWidth, dateLine, twip } from './layout';
import { PAYEE_LINE, formatDateCN, segments, splitParagraphs, type BusinessForm } from './templates';

/**
 * 业务单打印版面（A4）。
 *
 * 版面几何全部来自 lib/layout.ts（纸质原件实测值），页面预览、打印窗口与 .docx
 * 导出三条链路共用同一份数据结构，避免「屏幕上对、打印出来不对」。
 */

const mm = (twips: number) => `${twip(twips).toFixed(2)}mm`;
const pt = (twips: number) => `${(twips / 20).toFixed(1)}pt`;
/**
 * Word 的 docGrid（linePitch=312 twips）会把行高吸附到整数倍网格：
 * 12pt/14pt 字高一格装不下（15.6pt），实际占两格 = 31.2pt。
 * HTML 侧照此还原，否则行距被压成 2px、正文各行叠在一起。
 */
const gridLinesPt = (n: number) => pt(LAYOUT.docGridPitch * n);

/** 姓名在正文中加粗（原件中员工姓名为加粗 run） */
function highlight(text: string, term: string): string {
  return segments(text, term)
    .map((s) => (s.bold ? `<b>${escapeHtml(s.text)}</b>` : escapeHtml(s.text)))
    .join('');
}

export function buildFormSheetCss(): string {
  // 日期行：居中盒右边界外推 874 twips（原件 w:ind right="-874"），配合前导空格推到表格右上角
  const dateMarginRight = LAYOUT.marginRight + LAYOUT.dateIndentRight;
  return `
.ywd-page{ box-sizing:border-box; width:${mm(LAYOUT.pageW)}; min-height:${mm(LAYOUT.pageH)};
  padding-top:${mm(LAYOUT.marginTop)}; font-family:"SimSun","宋体","Songti SC",serif; color:#000; }
.ywd-title{ margin:0; text-align:center; font-size:${LAYOUT.titleSz / 2}pt; font-weight:bold; line-height:${gridLinesPt(
    2
  )}; }
.ywd-date{ margin:0 ${mm(dateMarginRight)} 0 ${mm(LAYOUT.marginLeft)}; text-align:center; white-space:pre;
  font-size:${LAYOUT.dateSz / 2}pt; line-height:${gridLinesPt(1)}; }
.ywd-table{ border-collapse:collapse; table-layout:fixed; width:${mm(LAYOUT.tableW)};
  margin-left:${mm(LAYOUT.marginLeft + LAYOUT.tableIndent)}; border-spacing:0; }
.ywd-table td{ border:${LAYOUT.borders.sz / 8}pt solid #000; padding:${mm(LAYOUT.cellMarTop)} ${mm(
    LAYOUT.cellMarRight
  )} ${mm(LAYOUT.cellMarBottom)} ${mm(LAYOUT.cellMarLeft)}; vertical-align:middle; font-weight:normal; }
.ywd-label{ text-align:center; font-size:${LAYOUT.labelSz / 2}pt; line-height:${gridLinesPt(2)}; }
.ywd-body{ font-size:${LAYOUT.bodySz / 2}pt; text-align:justify; line-height:${gridLinesPt(2)}; }
.ywd-body p{ margin:0; text-indent:2em; }
.ywd-body p.ywd-flush{ text-indent:0; }
`.trim();
}

/** 单据主体（A4 一页）HTML，页面预览与打印窗口共用 */
export function buildFormSheetHtml(form: BusinessForm): string {
  const paras = splitParagraphs(form.body);
  const bodyHtml = paras
    .map((p) => {
      const flush = PAYEE_LINE.test(p.trim());
      return `<p${flush ? ' class="ywd-flush"' : ''}>${highlight(p, form.name) || '<br>'}</p>`;
    })
    .join('');

  const rows = FORM_ROWS.map((row, ri) => {
    let blankSlot = -1;
    const cells = row.cells
      .map((cell, ci) => {
        const style = `width:${mm(cellWidth(ri, ci))};height:${mm(row.height)}`;
        const span = cell.span > 1 ? ` colspan="${cell.span}"` : '';
        if (cell.label) {
          return `<td class="ywd-label"${span} style="${style}">${escapeHtml(cell.label)}</td>`;
        }
        blankSlot += 1;
        if (ri === 0) {
          const v = blankSlot === 0 ? form.department : form.name;
          return `<td class="ywd-label"${span} style="${style}">${escapeHtml(v)}</td>`;
        }
        if (ri === 1) return `<td class="ywd-body"${span} style="${style}">${bodyHtml}</td>`;
        return `<td${span} style="${style}"></td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  // 六列网格显式声明：fixed 版面下未定型宽度的列会被均分余量，导致跨列单元格尺寸漂移
  const colgroup = `<colgroup>${LAYOUT.grid
    .map((g) => `<col style="width:${mm(g)}">`)
    .join('')}</colgroup>`;

  return `<div class="ywd-page">
  <div class="ywd-title">业务单</div>
  <div class="ywd-date">${escapeHtml(dateLine(formatDateCN(form.date)))}</div>
  <table class="ywd-table">${colgroup}<tbody>${rows}</tbody></table>
</div>`;
}

/** 完整打印文档（独立打印窗口；@page 无边界，版面自带页边距） */
export function buildFormPrintHtml(form: BusinessForm): string {
  const size = `${mm(LAYOUT.pageW)} ${mm(LAYOUT.pageH)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>业务单</title><style>@page{size:${size};margin:0}
html,body{margin:0;padding:0;background:#fff}
${buildFormSheetCss()}</style></head><body>${buildFormSheetHtml(form)}</body></html>`;
}

/** 打开独立打印窗口（与员工档案打印一致的行为） */
export function openFormPrintWindow(form: BusinessForm): void {
  const win = window.open('', '_blank', 'height=900,width=700');
  if (!win) return;
  win.document.write(buildFormPrintHtml(form));
  win.document.close();
  win.focus();
  // 等字体与表格布局落地后再唤起打印，避免首帧无样式
  win.setTimeout(() => win.print(), 200);
}
