import {
  AlignmentType,
  BorderStyle,
  Document,
  DocumentGridType,
  HeightRule,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignSection,
  VerticalAlignTable,
  WidthType,
  type IRunOptions,
  type ISectionOptions,
} from 'docx';
import { DATE_RIGHT_INDENT, LAYOUT, FORM_ROWS, cellWidth } from './layout';
import { PAYEE_LINE, formatDateCN, splitParagraphs, segments, type BusinessForm } from './templates';

/**
 * 业务单 .docx 导出：按原件 OOXML 几何逐项还原（页幅、页边距、表格宽/偏移/网格/行高/边框/字号）。
 * 与打印 HTML 共用 lib/layout.ts，两条链路同源。
 */

/** 原件默认字族：中文宋体、西文 Times New Roman（票据口径） */
const BASE_FONT = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: '宋体', cs: 'Times New Roman' };

const run = (text: string, extra: IRunOptions = {}): TextRun =>
  new TextRun({ text, font: BASE_FONT, ...extra });

function labelParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(text, { size: LAYOUT.labelSz })],
  });
}

function bodyParagraphs(body: string, name: string): Paragraph[] {
  const paras = splitParagraphs(body);
  if (!paras.length) return [emptyParagraph()];
  return paras.map(
    (p) =>
      new Paragraph({
        alignment: AlignmentType.BOTH,
        indent: PAYEE_LINE.test(p.trim()) ? undefined : { firstLine: LAYOUT.bodyFirstLine },
        spacing: { line: LAYOUT.bodyLineSpacing, lineRule: LineRuleType.AT_LEAST },
        children: segments(p, name).map((s) => run(s.text, { size: LAYOUT.bodySz, bold: s.bold || undefined })),
      })
  );
}

const emptyParagraph = (): Paragraph => new Paragraph({ children: [] });

const cell = (opts: {
  width: number;
  span: number;
  children: Paragraph[];
}): TableCell =>
  new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    ...(opts.span > 1 ? { columnSpan: opts.span } : {}),
    verticalAlign: VerticalAlignTable.CENTER,
    children: opts.children,
  });

const BORDER = { style: BorderStyle.SINGLE, size: LAYOUT.borders.sz, color: 'auto' };

/** 一条单据 = 一个 Word 分节（分节默认另起一页），所以 N 条就是 N 页、一页一条 */
function buildFormSection(form: BusinessForm): ISectionOptions {
  const rows = FORM_ROWS.map((row, ri) => {
    let blankSlot = -1;
    const children = row.cells.map((c, ci) =>
      cell({
        width: cellWidth(ri, ci),
        span: c.span,
        children: (() => {
          if (c.label) return [labelParagraph(c.label)];
          blankSlot += 1;
          if (ri === 0) return [labelParagraph(blankSlot === 0 ? form.department : form.name)];
          if (ri === 1) return bodyParagraphs(form.body, form.name);
          return [emptyParagraph()];
        })(),
      })
    );
    return new TableRow({ height: { value: row.height, rule: HeightRule.ATLEAST }, children });
  });

  const table = new Table({
    rows,
    width: { size: LAYOUT.tableW, type: WidthType.DXA },
    indent: { size: LAYOUT.tableIndent, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [...LAYOUT.grid],
    margins: {
      top: LAYOUT.cellMarTop,
      bottom: LAYOUT.cellMarBottom,
      left: LAYOUT.cellMarLeft,
      right: LAYOUT.cellMarRight,
      marginUnitType: WidthType.DXA,
    },
    borders: {
      top: BORDER,
      left: BORDER,
      bottom: BORDER,
      right: BORDER,
      insideHorizontal: BORDER,
      insideVertical: BORDER,
    },
  });

  return {
    properties: {
      page: {
        size: { width: LAYOUT.pageW, height: LAYOUT.pageH },
        margin: {
          top: LAYOUT.marginTop,
          bottom: LAYOUT.marginBottom,
          left: LAYOUT.marginLeft,
          right: LAYOUT.marginRight,
          header: 454,
          footer: 454,
          gutter: 0,
        },
      },
      grid: { type: DocumentGridType.LINES, linePitch: LAYOUT.docGridPitch, charSpace: 0 },
      // 与页面预览/打印窗口同一口径：整块内容竖向居中到纸张中间（sectPr 的 w:vAlign）
      verticalAlign: VerticalAlignSection.CENTER,
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run('业务单', { bold: true, size: LAYOUT.titleSz, sizeComplexScript: 32 })],
      }),
      new Paragraph({
        // 与打印 HTML 同一基线：右对齐到「表格右边往里缩 575 twips」。
        // 负 right 缩进是把段落右边界推到页边距之外（原件就是这么写的 w:ind right="-874"）。
        alignment: AlignmentType.RIGHT,
        indent: { right: DATE_RIGHT_INDENT },
        children: [run(formatDateCN(form.date), { size: LAYOUT.dateSz })],
      }),
      table,
      new Paragraph({ children: [] }),
    ],
  };
}

/**
 * 多条单据导成一个 Word 文件：一页一条。
 *
 * 与打印链路的口径不同是刻意的 —— 打印按「一张纸两条」省纸，Word 里是给人接着编辑的，
 * 一页一条改起来不会串到隔壁那张（2026-09-27 用户口径：docx 保持一页一份）。
 */
export function buildFormDocument(forms: BusinessForm[]): Document {
  return new Document({
    creator: 'AMS 行政管理系统',
    title: '业务单',
    description: '由 AMS 业务单生成模块导出',
    styles: {
      default: {
        document: { run: { font: BASE_FONT, size: LAYOUT.bodySz } },
      },
    },
    sections: forms.map(buildFormSection),
  });
}

/** 生成并下载 .docx（浏览器端 Packer.toBlob） */
export async function downloadFormDocx(forms: BusinessForm[], filename: string): Promise<void> {
  const blob = await Packer.toBlob(buildFormDocument(forms));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
