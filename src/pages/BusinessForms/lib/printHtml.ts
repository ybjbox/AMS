import { escapeHtml } from '@/utils/escapeHtml';
import { LAYOUT, FORM_ROWS, cellWidth, twip } from './layout';
import { SLOT_H, type SheetSlot } from './sheetLayout';
import { PAYEE_LINE, formatDateCN, segments, splitParagraphs, type BusinessForm } from './templates';

/**
 * 业务单打印版面（A4）。
 *
 * 版面几何全部来自 lib/layout.ts（纸质原件实测值），页面预览、打印窗口与 .docx
 * 导出三条链路共用同一份数据结构，避免「屏幕上对、打印出来不对」。
 * 一张纸打几份（含空白单）的判定在 lib/sheetLayout.ts，预览与打印同样走那一个结果。
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
  return `
/* 竖向：一张纸分成与份数等高的槽位，每份内容在自己的槽位里居中。
   槽位用 flex:1 0 auto（可长高、不缩），不用 height:50% —— 正文变长时定高会把内容挤出纸面。
   块内用 auto 外边距而不是 justify-content:center：内容超出槽位时 auto margin 归零、
   从槽位顶边开始排；flex 居中会把超出部分同时推到上边界之外，打印时直接裁掉第一行。
   横向：纸张内框不 left-align，而是把「标题+日期+表格」收成一个与表格等宽的块，
   margin-inline:auto 让整块居中（原件表格偏右 4.8mm，2026-09-27 按要求居中）；
   上下内边距对称，否则"居中"会比几何中心低半个上边距。 */
.ywd-page{ box-sizing:border-box; display:flex; flex-direction:column;
  width:${mm(LAYOUT.pageW)}; min-height:${mm(LAYOUT.pageH)};
  padding-top:${mm(LAYOUT.marginTop)}; padding-bottom:${mm(LAYOUT.marginBottom)};
  font-family:"SimSun","宋体","Songti SC",serif; color:#000; }
/* 多条单据会连成一份多页文档：第二页起强制换页，不要让浏览器靠"正好 297mm"去猜分页边界。
   页面预览里每张纸各渲染一次，这条选择器匹配不到，不影响屏幕显示。 */
.ywd-page + .ywd-page{ break-before: page; page-break-before: always; }
.ywd-slot{ box-sizing:border-box; flex:1 0 auto; display:flex; flex-direction:column; align-items:center; }
/* 两格的那张纸：每格定高半页（140.54mm），格底正好压在 A4 对折线上。
   不定高的话两条内容一高一矮时会各自分摊余量，矮的那格边界就不在折线上，
   对折裁剪会切到单据边框。超过半页的单据独占一张（那种本来就折不裁）。 */
.ywd-page[data-slots="2"] .ywd-slot{ flex:0 0 auto; height:${mm(SLOT_H)}; }
.ywd-block{ box-sizing:border-box; width:${mm(LAYOUT.tableW)}; margin:auto 0; }
.ywd-title{ margin:0; text-align:center; font-size:${LAYOUT.titleSz / 2}pt; font-weight:bold; line-height:${gridLinesPt(
    2
  )}; }
/* 日期改成右对齐：右边界 = 表格右边往里缩 575 twips（原件实测的缩进量）。
   以前是"居中 + 前导空格"推过去的，位置取决于对字宽的估算，实际字体度量一变就飘；
   右对齐后这条基线是几何量，预览/打印窗口/.docx 三条链路都能对上同一个数。 */
.ywd-date{ margin:0 ${mm(LAYOUT.dateRightInset)} 0 0; min-height:${gridLinesPt(1)}; text-align:right;
  font-size:${LAYOUT.dateSz / 2}pt; line-height:${gridLinesPt(1)}; }
.ywd-table{ border-collapse:collapse; table-layout:fixed; width:${mm(LAYOUT.tableW)};
  margin:0; border-spacing:0; }
.ywd-table td{ border:${LAYOUT.borders.sz / 8}pt solid #000; padding:${mm(LAYOUT.cellMarTop)} ${mm(
    LAYOUT.cellMarRight
  )} ${mm(LAYOUT.cellMarBottom)} ${mm(LAYOUT.cellMarLeft)}; vertical-align:middle; font-weight:normal; }
.ywd-label{ text-align:center; font-size:${LAYOUT.labelSz / 2}pt; line-height:${gridLinesPt(2)}; }
.ywd-body{ font-size:${LAYOUT.bodySz / 2}pt; text-align:justify; line-height:${gridLinesPt(2)}; }
.ywd-body p{ margin:0; text-indent:2em; }
.ywd-body p.ywd-flush{ text-indent:0; }
`.trim();
}

/** 一张单据（标题+日期+表格）收成一整块，供槽位水平/竖向居中 */
function buildFormBlockHtml(form: BusinessForm): string {
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

  return `<div class="ywd-block">
  <div class="ywd-title">业务单</div>
  <div class="ywd-date">${escapeHtml(formatDateCN(form.date))}</div>
  <table class="ywd-table">${colgroup}<tbody>${rows}</tbody></table>
</div>`;
}

/**
 * 一张纸（A4）的 HTML：槽位由 lib/sheetLayout 的 planSheets 决定，
 * 每个槽位要么是一条填好的单据，要么是补位的空白单。
 */
export function buildFormSheetHtml(slots: SheetSlot[]): string {
  const inner = slots
    .map(
      ({ form, blank }) =>
        `<div class="ywd-slot"${blank ? ' data-blank="true"' : ''}>${buildFormBlockHtml(form)}</div>`
    )
    .join('');
  return `<div class="ywd-page" data-slots="${slots.length}">${inner}</div>`;
}

/** 完整打印文档（独立打印窗口；@page 无边界，版面自带页边距） */
export function buildFormPrintHtml(sheets: SheetSlot[][]): string {
  const size = `${mm(LAYOUT.pageW)} ${mm(LAYOUT.pageH)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>业务单</title><style>@page{size:${size};margin:0}
html,body{margin:0;padding:0;background:#fff}
${buildFormSheetCss()}</style></head><body>${sheets.map((sheet) => buildFormSheetHtml(sheet)).join(
    ''
  )}</body></html>`;
}

/** 打开独立打印窗口（与员工档案打印一致的行为） */
export function openFormPrintWindow(sheets: SheetSlot[][]): void {
  const win = window.open('', '_blank', 'height=900,width=700');
  if (!win) return;
  win.document.write(buildFormPrintHtml(sheets));
  win.document.close();
  win.focus();
  // 等字体与表格布局落地后再唤起打印，避免首帧无样式
  win.setTimeout(() => win.print(), 200);
}
