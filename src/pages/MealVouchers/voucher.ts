/**
 * 工作餐券的版面模型：编号算法 + 号段台账 + 整版 HTML。
 *
 * 版式取自实际在用的 Excel 母版（E:/办公文件/工作餐券v1.xlsx，模版-1版100张），
 * 行高/字号/边距/线型都是用脚本从 xlsx 里量出来的（见 buildVoucherHtml 的注释），
 * 不是随手写的近似值。预览与打印共用这一份 HTML 字符串，
 * 避免"看着对、打出来不对"这种两套版面漂移。
 */
import { escapeHtml } from '@/utils/escapeHtml';

/** 券面日期。三段各自可留空，留空印成手写占位（一个中文字符宽的下划线）。 */
export interface VoucherDate {
  year: string;
  month: string;
  day: string;
}

/** 一段连续号（原始数字，不含 NO. 前缀） */
export interface NumberRange {
  from: number;
  to: number;
}

/**
 * 一次打印的台账：号段按列拆开存，"这批是否打过"与"下一批从几号起"都由它算出来。
 * 存在 saved-items（kind=meal-voucher-print，按账号隔离），一行一批。
 */
export interface VoucherPrintRecord {
  id: string;
  /** 打印时刻（ISO）；saved-items 的行名也用它 */
  at: string;
  startNo: number;
  count: number;
  cols: number;
  perCol: number;
  splitByColumn: boolean;
  paperSize: string;
  title: string;
  ranges: NumberRange[];
}

export interface VoucherSpec {
  /** 券名行上方的机构名 */
  org: string;
  /** 面额行，如「30元工作餐券」 */
  title: string;
  /** 使用说明整句 */
  note: string;
  /** 使用地点 */
  place: string;
  /** 使用时间·起始日（年月日可分别留空） */
  periodFrom: VoucherDate;
  /** 使用时间·截止日 */
  periodTo: VoucherDate;
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
  /** 纸张，默认 A4；@page 与预览宽度都随它走 */
  paperSize: string;
}

export const PAPER_SIZES = [
  { id: 'A4', label: 'A4（210×297mm）', w: 210, h: 297 },
  { id: 'A5', label: 'A5（148×210mm）', w: 148, h: 210 },
  { id: 'B5', label: 'B5（176×250mm）', w: 176, h: 250 },
  { id: 'Letter', label: 'Letter（216×279mm）', w: 215.9, h: 279.4 },
] as const;

export const DEFAULT_PAPER = 'A4';

/** 母版 pageMargins（英寸 0.2361/0.1569/0.2361/0.1965 → mm），换纸张不改边距 */
export const PAGE_MARGINS = { top: 6, right: 4, bottom: 6, left: 5 } as const;

/** 整券高度：六行内容 55.84mm + 上双线 0.79mm，与母版 56.63mm 对齐 */
export const VOUCHER_HEIGHT_MM = 56.63;

/** 使用时间的基准字号（母版 13pt）；占位符变宽时只允许这一行往下缩 */
export const PERIOD_BASE_FONT_PT = 13;

/** 缩到这一步就不再缩：再小手写券上看不清，改由"券宽不够"的警告提示用户 */
export const PERIOD_MIN_FONT_PT = 9;

/** 估算留的余头：实机量过，按整宽算会差约 1.5mm 把行尾裁掉 */
const FIT_MARGIN = 0.97;

/** 手写占位：一个全角空格 U+3000（写成码位避免被当成普通空格） */
export const DATE_BLANK = String.fromCharCode(0x3000);

/**
 * 占位段的固定宽度 = 一个 13pt 中文字符（母版字号）。
 * 券宽不够时只缩文字、不缩占位：留出写字的地方是这条占位存在的唯一理由，
 * 跟着缩就变成一条写不下东西的细线。
 */
export const HANDWRITE_BLANK_MM = 4.6;

export const EMPTY_DATE: VoucherDate = { year: '', month: '', day: '' };

export const DEFAULT_SPEC: VoucherSpec = {
  org: '淡村鹤龄社区食堂',
  title: '30元工作餐券',
  note: '使用说明：本券不找零，不兑换现金，过期作废',
  place: '使用地点：淡村商贸城六号楼一层淡村鹤龄食堂',
  // 母版就是"年份印好、月日留空手写"，所以默认只填年
  periodFrom: { year: '2026', month: '', day: '' },
  periodTo: { year: '2026', month: '', day: '' },
  startNo: 1200,
  count: 20,
  pad: 4,
  cols: 2,
  perCol: 50,
  splitByColumn: true,
  gutterMm: 6,
  paperSize: DEFAULT_PAPER,
};

export function paperById(id: string) {
  return PAPER_SIZES.find((p) => p.id === id) ?? PAPER_SIZES[0];
}

export function printableWidthMm(paperId: string): number {
  const p = paperById(paperId);
  return +(p.w - PAGE_MARGINS.left - PAGE_MARGINS.right).toFixed(2);
}

export function printableHeightMm(paperId: string): number {
  const p = paperById(paperId);
  return +(p.h - PAGE_MARGINS.top - PAGE_MARGINS.bottom).toFixed(2);
}

/** 一行券面文字大约多宽：中日韩字符按 1em（13pt = 4.59mm），其余按 0.62em（雅黑数字实测比半宽宽） */
export function estimateLineMm(text: string): number {
  const cjk = 4.59;
  let mm = 0;
  for (const ch of text ?? '') {
    mm += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000]/.test(ch) ? cjk : cjk * 0.62;
  }
  return +mm.toFixed(1);
}

/**
 * 版面事实：券宽、每页几张、共几页，以及最长一行放不放得下。
 * 换纸张或改列数后这些都会变，界面上要如实显示，不能让人拿 A4 的直觉去打 A5。
 *
 * 使用时间的占位符是一个中文字符宽（够手写、又不至于把整行挤出券外）：
 * 这一行按券宽自动缩字号（periodFontPt，母版基准 13pt，下限 9pt），占位本身定宽不缩，
 * 其余四行保持母版尺寸，放不下就如实报警。
 */
export function layoutFacts(spec: VoucherSpec) {
  const usable = printableWidthMm(spec.paperSize);
  const gutter = Math.min(spec.gutterMm, Math.max(0, usable - spec.cols));
  const voucherWidthMm = +((usable - gutter * (spec.cols - 1)) / spec.cols).toFixed(1);
  const rowsPerPage = Math.max(
    1,
    Math.floor(printableHeightMm(spec.paperSize) / VOUCHER_HEIGHT_MM)
  );
  const perPage = rowsPerPage * spec.cols;
  const longestLineMm = Math.max(
    estimateLineMm(spec.org),
    estimateLineMm(spec.title),
    estimateLineMm(spec.place),
    estimateLineMm(spec.note)
  );
  const periodLine = periodText(spec);
  const blankCount = periodLine.split(DATE_BLANK).length - 1;
  const blanksMm = blankCount * HANDWRITE_BLANK_MM;
  const restMm = estimateLineMm(periodLine.split(DATE_BLANK).join(''));
  const roomForTextMm = voucherWidthMm * FIT_MARGIN - blanksMm;
  const wantedPt = restMm > 0 ? (PERIOD_BASE_FONT_PT * roomForTextMm) / restMm : PERIOD_BASE_FONT_PT;
  const periodFontPt = +Math.max(
    PERIOD_MIN_FONT_PT,
    Math.min(PERIOD_BASE_FONT_PT, wantedPt)
  ).toFixed(1);
  return {
    voucherWidthMm,
    rowsPerPage,
    perPage,
    pages: Math.max(1, Math.ceil(spec.count / perPage)),
    longestLineMm,
    periodFontPt,
    /** 固定字号的四行（机构名/面额/地点/说明）放不下 */
    tooNarrow: longestLineMm > voucherWidthMm,
    /** 使用时间行：占位放完就没地方写字，或文字缩到下限仍放不下 */
    periodTooWide: roomForTextMm <= 0 || wantedPt < PERIOD_MIN_FONT_PT,
  };
}

const onlyDigits = (v: string, max: number) => (v ?? '').replace(/\D/g, '').slice(0, max);

/** 日期三段 → 券面文字；缺的那一段用一个全角空格占位（宽度够手写） */
export function voucherDateText(d: VoucherDate): string {
  return (
    `${onlyDigits(d?.year, 4) || DATE_BLANK}年` +
    `${onlyDigits(d?.month, 2) || DATE_BLANK}月` +
    `${onlyDigits(d?.day, 2) || DATE_BLANK}日`
  );
}

/** 「使用时间：起-止」整句（纯文本，用于显示与宽度估算） */
export function periodText(spec: VoucherSpec): string {
  return `使用时间：${voucherDateText(spec.periodFrom)}-${voucherDateText(spec.periodTo)}`;
}

/** 同一个句子的 HTML：把占位段换成定宽、带下划线的填空 */
function periodHtml(spec: VoucherSpec): string {
  const cell = (d: VoucherDate) =>
    voucherDateText(d).split(DATE_BLANK).join(`<span class="fill blank">${DATE_BLANK}</span>`);
  return `使用时间：${cell(spec.periodFrom)}-${cell(spec.periodTo)}`;
}

/** 本批要印的原始号，顺序与券位一致 */
export function voucherRawNumbers(spec: VoucherSpec): number[] {
  const rows = Math.max(1, Math.ceil(spec.count / spec.cols));
  const out: number[] = [];
  for (let slot = 0; slot < spec.cols * rows; slot += 1) {
    if (out.length >= spec.count) break;
    const col = slot % spec.cols;
    const row = Math.floor(slot / spec.cols);
    out.push(spec.splitByColumn ? spec.startNo + col * spec.perCol + row : spec.startNo + slot);
  }
  return out;
}

/** 编号序列（券面上看到的 NO.xxxx） */
export function voucherNumbers(spec: VoucherSpec): string[] {
  return voucherRawNumbers(spec).map((n) => `NO.${String(n).padStart(Math.max(1, spec.pad), '0')}`);
}

/**
 * 本批实际占用的号段，按列拆开：分列号段时每列一段（列内连续），
 * 逐张连续时整批就是一段。重叠判定只看这些区间。
 */
export function voucherRanges(spec: VoucherSpec): NumberRange[] {
  const raw = voucherRawNumbers(spec);
  if (!raw.length) return [];
  if (!spec.splitByColumn) return [{ from: Math.min(...raw), to: Math.max(...raw) }];
  const byCol = new Map<number, number[]>();
  raw.forEach((n, slot) => {
    const col = slot % spec.cols;
    byCol.set(col, [...(byCol.get(col) ?? []), n]);
  });
  return [...byCol.values()].map((list) => ({ from: Math.min(...list), to: Math.max(...list) }));
}

export function rangesIntersect(a: NumberRange, b: NumberRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** 历史台账里第一个与本批号段撞上的那一批 */
export function findOverlap(
  spec: VoucherSpec,
  records: VoucherPrintRecord[]
): VoucherPrintRecord | null {
  const pending = voucherRanges(spec);
  for (const rec of records) {
    const ranges = Array.isArray(rec?.ranges) ? rec.ranges : [];
    if (ranges.some((r) => pending.some((p) => rangesIntersect(p, r)))) return rec;
  }
  return null;
}

/**
 * 建议的起始号 = 已打印各批里最靠后的"起始号 + 张数"。
 * 分列号段下正好接在左列后面（1200 打 20 张 → 下一批从 1220 起），
 * 与母版按整块推进号段的用法一致。
 */
export function nextStartNo(records: VoucherPrintRecord[], fallback: number): number {
  const candidates = records.map((r) => (r?.startNo ?? 0) + (r?.count ?? 0));
  return candidates.length ? Math.max(fallback, ...candidates) : fallback;
}

/** 打印台账 payload（saved-items 回读时再补 id） */
export function toPrintRecord(spec: VoucherSpec, at: Date): Omit<VoucherPrintRecord, 'id'> {
  return {
    at: at.toISOString(),
    startNo: spec.startNo,
    count: spec.count,
    cols: spec.cols,
    perCol: spec.perCol,
    splitByColumn: spec.splitByColumn,
    paperSize: spec.paperSize,
    title: spec.title,
    ranges: voucherRanges(spec),
  };
}

/** 台账行上的号段摘要，如「1200-1209、1250-1259」 */
export function formatRecordRange(rec: VoucherPrintRecord, pad: number): string {
  const no = (n: number) => String(n).padStart(Math.max(1, pad), '0');
  return (rec.ranges ?? []).map((r) => `${no(r.from)}-${no(r.to)}`).join('、');
}

/** 按纸张分页：每页 rowsPerPage 行 × cols 列（预览与打印都按「一张纸」来看） */
export function voucherPages(spec: VoucherSpec, numbers: string[]): string[][] {
  const { perPage } = layoutFacts(spec);
  const pages: string[][] = [];
  for (let i = 0; i < numbers.length; i += perPage) pages.push(numbers.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

/** 生成整版 HTML：预览与打印共用，一张纸一个 .sheet。 */
export function buildVoucherHtml(spec: VoucherSpec, numbers: string[]): string {
  /** 券面文字里的连续两个以上空格都是手写填空位（母版日期就这么排），加下划线。 */
  const fill = (s: string) =>
    escapeHtml(s).replace(/ {2,}/g, (m) => `<span class="fill">${m}</span>`);
  const voucher = (no: string) => `
    <div class="r org">${fill(spec.org)}</div>
    <div class="r amt">${fill(spec.title)}</div>
    <div class="r no">${escapeHtml(no)}</div>
    <div class="r ln period">${periodHtml(spec)}</div>
    <div class="r ln">${fill(spec.place)}</div>
    <div class="r note">${fill(spec.note)}</div>`;
  const sheets = voucherPages(spec, numbers)
    .map((page) => {
      const rowsOut: string[] = [];
      const rowCount = Math.max(1, Math.ceil(page.length / spec.cols));
      for (let r = 0; r < rowCount; r += 1) {
        const parts: string[] = [];
        for (let c = 0; c < spec.cols; c += 1) {
          const idx = r * spec.cols + c;
          const last = r === rowCount - 1 ? ' last' : '';
          parts.push(`<td class="cell${last}">${voucher(page[idx] ?? '')}</td>`);
          if (c < spec.cols - 1) parts.push('<td class="gut"><span class="cut"></span></td>');
        }
        rowsOut.push(`<tr>${parts.join('')}</tr>`);
      }
      return `<section class="sheet"><table>${rowsOut.join('')}</table></section>`;
    })
    .join('');
  const paper = paperById(spec.paperSize);
  const facts = layoutFacts(spec);
  /**
   * 母版实测：每券 6 行 = 12.97 + 14.82 + 6.35×3 + 9.79 = 56.63mm（Excel 行高含边框），
   * 整列 50 张分 10 页 A4；券体只有左右细边、上下双线（券与券共用一条双线，行内没有任何横线），
   * 切断线是 gap 正中央的一条点线；字体全篇隶书、不加粗。
   *
   * 这里把线框画在单元格上（3px double ≈ 0.79mm），所以末行说明取 9mm 而不是母版的 9.79mm：
   * 55.84mm 内容 + 0.79mm 上双线 = 56.63mm，与母版整券等高，
   * 这样 A4 每页仍是 2 列 × 5 张 = 10 张（取 9.79 会挤成 4 行，20 张要多打一整页）。
   *
   * 分页做法与会议台卡一致：@page 无边距、一张纸 = 一个定尺寸 .sheet、页边距做成 sheet 的 padding，
   * 所以预览看到的就是打印出来的那一页（灰底、白卡、阴影与页码标注只在 screen 媒体里加）。
   */
  return `<!doctype html><html><head><meta charset="utf-8"><title>餐券</title><style>
    @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
    html, body { margin: 0; }
    body { font-family: LiSu, SimLi, 隶书, "Noto Sans SC","Microsoft YaHei",sans-serif; color: #000; }
    .sheet { width: ${paper.w}mm; height: ${paper.h}mm; box-sizing: border-box; overflow: hidden;
      padding: ${PAGE_MARGINS.top}mm ${PAGE_MARGINS.right}mm ${PAGE_MARGINS.bottom}mm ${PAGE_MARGINS.left}mm;
      break-after: page; page-break-after: always; }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
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
    /* 使用时间：整行放不下时只缩这一行（母版基准 13pt，下限 9pt） */
    .period { font-size: ${facts.periodFontPt}pt; }
    .note { height: 9mm; }
    .fill { text-decoration: underline; }
    /* 日期占位定宽：整行缩字号时手写空间也不跟着变小（一个 13pt 中文字符） */
    .blank { display: inline-block; width: ${HANDWRITE_BLANK_MM}mm; }
    @media screen {
      /* 顶部留白给「预览纸张 …第 N 页」这行标注（角标与缩放已在纸面上方的工具栏里） */
      body { background: #f4f5f7; counter-reset: pg; padding: 34px 12px 0; }
      /* 屏幕态放开裁切，纸张标注才能落在纸面上方（打印态仍然 overflow: hidden 防溢出到下一页） */
      .sheet { position: relative; overflow: visible; counter-increment: pg; background: #fff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, .22); margin: 0 0 40px; }
      .sheet::before { content: "预览纸张: ${paper.id} (${paper.w}x${paper.h}mm) - 第 " counter(pg) " 页";
        position: absolute; left: 2px; top: -20px; font-size: 12px; line-height: 1.3; color: #52525b;
        font-family: "Noto Sans SC","Microsoft YaHei",sans-serif; }
    }
  </style></head><body>${sheets}</body></html>`;
}
