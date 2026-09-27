/**
 * 「一张纸上下两条业务单」的版面判定 —— 纯计算，预览、打印窗口与提示文案共用同一份口径。
 *
 * 纸质《业务单》原件一张 A4 只有一张单据，下方大片空白。既然竖着还能再塞一张原尺寸的单据，
 * 就固定切成上下两格：第 1、2 条同纸，第 3、4 条下一张……凑不满的那一格补一张空白单，
 * 留着手写（2026-09-27 需求：内容不重复、多出来的位置免得浪费纸张）。
 *
 * 两格是定高的，分界线正好落在 A4 的对折线上（上下页边距对称 → 454 + 7965 = 16838/2）。
 * 单据只会在格子里居中，不会跨过折线，所以"对折一刀"就能把两张单据裁开（含只有一条时）。
 *
 * 单位全部是 twips（1 twip = 1/1440 英寸），几何常量来自 ./layout，避免这里再抄一遍数字。
 */
import { LAYOUT, FORM_ROWS, cellWidth, textWidthTwips } from './layout';
import { PAYEE_LINE, splitParagraphs, type BusinessForm } from './templates';

/** 空白单：与打印件同一副骨架（标题、栏目名、行高、日期行占位），只不填值 */
export const BLANK_FORM: BusinessForm = {
  kind: 'custom',
  department: '',
  name: '',
  date: '',
  relation: '',
  amount: 0,
  body: '',
};

/** 纸张去掉上下页边距后的可用高度（twips） */
export const PAGE_INNER_H = LAYOUT.pageH - LAYOUT.marginTop - LAYOUT.marginBottom;

/** 一张纸固定两格，每格定高 7965 twips ≈ 140.5mm；格底正好是 A4 的对折线 */
export const SLOTS_PER_PAGE = 2;
export const SLOT_H = Math.floor(PAGE_INNER_H / SLOTS_PER_PAGE);

/** 正文行在 docGrid 上占整数格：12pt 字高一格装不下，实际每行 2 格 */
const BODY_LINE_H = LAYOUT.docGridPitch * 2;
/** 标题（2 格）+ 日期行（1 格）的固定开销 */
const HEAD_H = LAYOUT.docGridPitch * 3;
const ROWS_H = FORM_ROWS.reduce((sum, row) => sum + row.height, 0);
const BODY_ROW_MIN = FORM_ROWS[1].height;

/** 一张单据骨架的最小高度（正文不超过行最小高度时）：6917 twips ≈ 122.0mm */
export const MIN_BLOCK_H = HEAD_H + ROWS_H;

/** 正文格的可用宽度：跨 5 列的网格宽 - 左右单元格边距 - 左右边框 */
export const BODY_USABLE_W = cellWidth(1, 1) - LAYOUT.cellMarLeft - LAYOUT.cellMarRight - 20;

/** 正文要占几行（按 12pt 宋体字宽估算，收款信息行不缩进） */
export function bodyLines(body: string): number {
  return splitParagraphs(body).reduce((sum, p) => {
    // 首行比其余行少放一个缩进量：第一行容量 = 可用宽 - firstLine
    const indent = PAYEE_LINE.test(p.trim()) ? 0 : LAYOUT.bodyFirstLine;
    const first = BODY_USABLE_W - indent;
    const lines = 1 + Math.ceil(Math.max(0, textWidthTwips(p) - first) / BODY_USABLE_W);
    return sum + lines;
  }, 0);
}

/** 这张单据实际要多高：正文行高超过行的最小高度时按实际行数撑高 */
export function blockHeight(form: BusinessForm): number {
  const bodyH = Math.max(BODY_ROW_MIN, bodyLines(form.body) * BODY_LINE_H);
  return MIN_BLOCK_H - BODY_ROW_MIN + bodyH;
}

export interface SheetSlot {
  form: BusinessForm;
  blank: boolean;
}

export interface SheetPlan {
  /** 每项是一张纸，纸内是上下两格（第二格可能是补位的空白单；超高那条独占的那张只有一格） */
  sheets: SheetSlot[][];
  itemCount: number;
  /** 装不下一格、被迫独占一张纸的条目（no 是给用户看的 1 基序号） */
  oversized: Array<{ no: number; lines: number }>;
}

/**
 * 条目 → 一张张纸。要求是「原尺寸不缩放」，所以某条正文长到一格装不下时不能靠缩小解决：
 * 让它独占一张（否则会被挤到下一页、凭空多出一张纸），并且不给它补空白单 ——
 * 补了必然溢出。这一条要告诉用户。
 */
export function planSheets(items: BusinessForm[]): SheetPlan {
  const sheets: SheetSlot[][] = [];
  const oversized: Array<{ no: number; lines: number }> = [];
  let current: SheetSlot[] = [];

  const flush = () => {
    if (!current.length) return;
    // 单数的一格补一张空白单；超高那条独占的那张不补（补了就溢出成第二页）
    if (current.length === 1 && blockHeight(current[0].form) <= SLOT_H) {
      current.push({ form: BLANK_FORM, blank: true });
    }
    sheets.push(current);
    current = [];
  };

  items.forEach((form, i) => {
    if (blockHeight(form) > SLOT_H) {
      flush();
      sheets.push([{ form, blank: false }]);
      oversized.push({ no: i + 1, lines: bodyLines(form.body) });
      return;
    }
    if (current.length >= SLOTS_PER_PAGE) flush();
    current.push({ form, blank: false });
  });
  flush();

  return { sheets, itemCount: items.length, oversized };
}
