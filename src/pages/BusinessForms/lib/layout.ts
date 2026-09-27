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
  /** 表格宽与左偏移。原件实测偏移是 -612（表格左边 20.9mm、右边 11.3mm，整块偏右 4.8mm）；
      2026-09-27 按要求改成「整块水平居中」，取 (pageW - tableW) / 2 - marginLeft = -884，
      表格左右各留 16.10mm。三条链路（预览 / 打印窗口 / .docx）共用这一个值。 */
  tableW: 10080,
  tableIndent: -884,
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
  /** 落款日期行：12pt，右对齐到「表格右边往里缩 575 twips」那条基线 */
  dateSz: 24,
  dateRightInset: 575,
  /** 栏目名 14pt 居中；正文 12pt */
  labelSz: 28,
  bodySz: 24,
  bodyFirstLine: 480,
  bodyLineSpacing: 360,
} as const;

/** 表格左边界（相对页左边，twips）= 居中后的结果 913 */
export const TABLE_LEFT = LAYOUT.marginLeft + LAYOUT.tableIndent;
/** 表格右边界（相对页左边，twips）= 10993，左边留 16.10mm、右边同样留 16.10mm */
export const TABLE_RIGHT = TABLE_LEFT + LAYOUT.tableW;
/** 日期行的右边界（相对页左边）：原件上它比表格右边框往里缩 575 twips，居中后保持这一相对关系 */
export const DATE_RIGHT = TABLE_RIGHT - LAYOUT.dateRightInset;
/** Word 侧的 w:ind right（正值往内收）：让日期右边界正好落到 DATE_RIGHT */
export const DATE_RIGHT_INDENT = LAYOUT.pageW - LAYOUT.marginRight - DATE_RIGHT;

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
 * 12pt 宋体的字宽估算：全角字 240 twips（正好一个字号），半角 120；码位阈值沿用原件口径。
 *
 * 日期行以前靠「居中段落 + 前导空格」推到表格右上角，并按这个字宽模型反推空格数 —— 那个估算
 * 会让日期位置随实际字体度量漂移，2026-09-27 改成右对齐到 DATE_RIGHT 后不再需要。
 * 这里保留字宽模型，只用来估算正文要占几行（决定一张纸放不放得下两份）。
 */
export function textWidthTwips(text: string, fullWidth = 240): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! > 0x2e7f ? fullWidth : fullWidth / 2;
  return w;
}
