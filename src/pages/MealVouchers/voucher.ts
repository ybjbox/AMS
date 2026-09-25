/**
 * 工作餐券的版面模型：编号算法 + 整版 HTML。
 *
 * 版式取自实际在用的 Excel 母版（E:/办公文件/工作餐券v1.xlsx，模版-1版100张），
 * 行高/字号/边距/线型都是用脚本从 xlsx 里量出来的（见 buildVoucherHtml 的注释），
 * 不是随手写的近似值。预览与打印共用这一份 HTML 字符串，
 * 避免"看着对、打出来不对"这种两套版面漂移。
 */
import { escapeHtml } from '@/utils/escapeHtml';

export interface VoucherSpec {
  /** 券名行上方的机构名 */
  org: string;
  /** 面额行，如「30元工作餐券」 */
  title: string;
  /** 使用说明整句 */
  note: string;
  /** 使用地点 */
  place: string;
  /** 使用时间文案（留空则只印「使用时间：」供手写） */
  period: string;
  startNo: number;
  count: number;
  /** 编号补零位数（母版是 4 → NO.1200） */
  pad: number;
  /** 每页列数（母版 2） */
  cols: number;
  /** 每列券数（母版 50 → 双列共 100 张） */
  perCol: number;
  /** 分列号段：右列 = 左列 + 每列张数（母版公式即此）；否则逐张连续 */
  splitByColumn: boolean;
  /** 剪切断开槽宽度 mm（母版 F+G 两窄列实测 5.8mm，点线在正中间） */
  gutterMm: number;
}

export const DEFAULT_SPEC: VoucherSpec = {
  org: '淡村鹤龄社区食堂',
  title: '30元工作餐券',
  note: '使用说明：本券不找零，不兑换现金，过期作废',
  place: '使用地点：淡村商贸城六号楼一层淡村鹤龄食堂',
  period: '使用时间：2026年  月  日-2026年  月  日',
  startNo: 1200,
  count: 20,
  pad: 4,
  cols: 2,
  perCol: 50,
  splitByColumn: true,
  gutterMm: 6,
};

/** 编号序列：分列号段时第 c 列整体偏移 c*perCol，与母版公式一致。 */
export function voucherNumbers(spec: VoucherSpec): string[] {
  const rows = Math.max(1, Math.ceil(spec.count / spec.cols));
  const out: string[] = [];
  for (let slot = 0; slot < spec.cols * rows; slot += 1) {
    const col = slot % spec.cols;
    const row = Math.floor(slot / spec.cols);
    if (out.length >= spec.count) break;
    const n = spec.splitByColumn
      ? spec.startNo + col * spec.perCol + row
      : spec.startNo + slot;
    out.push(`NO.${String(n).padStart(Math.max(1, spec.pad), '0')}`);
  }
  return out;
}

/** 生成整版 HTML：预览与打印共用。 */
export function buildVoucherHtml(spec: VoucherSpec, numbers: string[]): string {
  /** 母版日期里「  」是带下划线的填空位（供手写），连续两个以上空格同样处理。 */
  const fill = (s: string) =>
    escapeHtml(s).replace(/ {2,}/g, (m) => `<span class="fill">${m}</span>`);
  const voucher = (no: string) => `
    <div class="r org">${fill(spec.org)}</div>
    <div class="r amt">${fill(spec.title)}</div>
    <div class="r no">${escapeHtml(no)}</div>
    <div class="r ln">${fill(spec.period)}</div>
    <div class="r ln">${fill(spec.place)}</div>
    <div class="r note">${fill(spec.note)}</div>`;
  const rowsOut: string[] = [];
  const rowCount = Math.ceil(numbers.length / spec.cols);
  for (let r = 0; r < rowCount; r += 1) {
    const parts: string[] = [];
    for (let c = 0; c < spec.cols; c += 1) {
      const idx = r * spec.cols + c;
      const last = r === rowCount - 1 ? ' last' : '';
      parts.push(`<td class="cell${last}">${voucher(numbers[idx] ?? '')}</td>`);
      if (c < spec.cols - 1) parts.push('<td class="gut"><span class="cut"></span></td>');
    }
    rowsOut.push(`<tr>${parts.join('')}</tr>`);
  }
  /**
   * 母版实测：每券 6 行 = 12.97 + 14.82 + 6.35×3 + 9.79 = 56.63mm（Excel 行高含边框），
   * 整列 50 张分 10 页 A4；券体只有左右细边、上下双线（券与券共用一条双线，行内没有任何横线），
   * 切断线是 gap 正中央的一条点线；字体全篇隶书、不加粗；pageMargins 上6 右4 下6 左5mm。
   *
   * 这里把线框画在单元格上（3px double ≈ 0.79mm），所以末行说明取 9mm 而不是母版的 9.79mm：
   * 55.84mm 内容 + 0.79mm 上双线 = 56.63mm，与母版整券等高，
   * 这样每页仍是 2 列 × 5 张 = 10 张（取 9.79 会挤成 4 行，20 张要多打一整页）。
   */
  return `<!doctype html><html><head><meta charset="utf-8"><title>餐券</title><style>
    @page { size: A4 portrait; margin: 6mm 4mm 6mm 5mm; }
    /* 正文宽 = A4 可印宽（210 − 左5 − 右4）：预览与打印同一宽度，
       否则预览按 iframe 收窄会把长句显示成被裁切（看着打不出来，实际能打出）。 */
    body { margin: 0; width: 201mm; font-family: LiSu, SimLi, 隶书, "Noto Sans SC","Microsoft YaHei",sans-serif; color: #000; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    td.cell { padding: 0; vertical-align: top; border-left: 1px solid #000; border-right: 1px solid #000; border-top: 3px double #000; }
    td.cell.last { border-bottom: 3px double #000; }
    td.gut { width: ${spec.gutterMm}mm; position: relative; }
    .cut { position: absolute; top: 0; bottom: 0; left: 50%; border-left: 1px dotted #000; }
    /* 不留内缩：母版的长句（21 字的「使用地点」）本来就贴着券边，加 1mm 就会被裁掉 */
    .r { overflow: hidden; white-space: nowrap; line-height: 6.35mm; font-size: 13pt; }
    .org { height: 12.97mm; line-height: 12.97mm; font-size: 20pt; text-align: center; }
    .amt { height: 14.82mm; line-height: 14.82mm; font-size: 30pt; text-align: center; }
    .no { height: 6.35mm; text-align: center; }
    .ln { height: 6.35mm; }
    .note { height: 9mm; }
    .fill { text-decoration: underline; }
  </style></head><body><table>${rowsOut.join('')}</table></body></html>`;
}
