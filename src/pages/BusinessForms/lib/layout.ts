/**
 * 业务单原件（业务单-空白模板.doc）版面参数 —— 单一事实来源。
 *
 * 数值直接取自模板 word/document.xml（单位 twips），打印 HTML 与 .docx 导出共用，
 * 保证两条输出链路与纸质原件一致。1 twip = 1/1440 英寸。
 */

export const twip = (v: number): number => (v * 25.4) / 1440;

/** 半磅 → pt（Word 的 w:sz 以半磅计） */
export const halfPtToPt = (v: number): number => v / 2;

export const LAYOUT = {
  pageW: 11906,
  pageH: 16838,
  marginTop: 454,
  marginBottom: 454,
  marginLeft: 1797,
  marginRight: 1797,
  /** 表格宽与左偏移（原件故意压住左右页边距） */
  tableW: 10080,
  tableIndent: -612,
  /** 原件六列网格 */
  grid: [2160, 2880, 360, 1440, 360, 2880] as const,
  borders: { style: 'single', sz: 4 } as const,
  cellMarTop: 0,
  cellMarBottom: 0,
  cellMarLeft: 108,
  cellMarRight: 108,
  /** 行网格（w:docGrid linePitch）：Word 按此值吸附行高，HTML 侧用来还原同样的行距 */
  docGridPitch: 312,
  /** 标题：宋体加粗 22pt 居中 */
  titleSz: 44,
  /** 落款日期行：12pt 居中，右边界外推 -874 */
  dateSz: 24,
  dateIndentRight: -874,
  /** 栏目名 14pt 居中；正文 12pt */
  labelSz: 28,
  bodySz: 24,
  bodyFirstLine: 480,
  bodyLineSpacing: 360,
} as const;

/** 一行表格：由若干单元格组成，span 为跨越的网格列数 */
export interface CellSpec {
  label?: string;
  span: number;
}

/** 五行业务栏定义（原件 trHeight 与列分布） */
export const FORM_ROWS: Array<{ height: number; cells: CellSpec[] }> = [
  {
    height: 703,
    cells: [
      { label: '部 门', span: 1 },
      { span: 2 },
      { label: '姓 名', span: 1 },
      { span: 2 },
    ],
  },
  { height: 2847, cells: [{ label: '需办理的业务', span: 1 }, { span: 5 }] },
  {
    height: 761,
    cells: [
      { label: '部门主管签名', span: 1 },
      { span: 1 },
      { label: '财务主管签名', span: 3 },
      { span: 1 },
    ],
  },
  { height: 843, cells: [{ label: '总经理批示', span: 1 }, { span: 5 }] },
  { height: 827, cells: [{ label: '董事长批示', span: 1 }, { span: 5 }] },
];

/** 每格宽度（twips）：按网格列累加 span */
export function cellWidth(row: number, cellIndex: number): number {
  const { grid } = LAYOUT;
  let col = 0;
  for (let i = 0; i < cellIndex; i++) col += FORM_ROWS[row].cells[i].span;
  let w = 0;
  for (let i = 0; i < FORM_ROWS[row].cells[cellIndex].span; i++) w += grid[col + i];
  return w;
}

/**
 * 原件日期行的排版手法：居中段落 + 前导半角空格，把日期推到表格右上角。
 * 目标右边界 10690 twips（原件实测），按日期实际宽度反推空格数，任意日期长度都对齐同一条基线。
 */
export function dateLine(dateText: string): string {
  const targetTextWidth = 8600;
  let w = 0;
  for (const ch of dateText) w += ch.codePointAt(0)! > 0x2e7f ? 240 : 120;
  const spaces = Math.max(0, Math.round((targetTextWidth - w) / 120));
  return ' '.repeat(spaces) + dateText;
}
