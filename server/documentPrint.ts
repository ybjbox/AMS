/**
 * 文档「一键打包打印」的内容装配：把 uploads 里已落盘的文件按类型转成可打印片段。
 *
 * 只输出结构化数据（文本 / 表格行 / 图片页 data URL），**不拼 HTML** ——
 * 转义与排版归前端 builder（P2-1 的打印 XSS 教训：用户可控字段必须走 escape）。
 *
 * 刻意不复用 /api/files/:id：那条路强制 attachment + nosniff（防存储型 XSS），
 * 天生不能当图片/内联内容用；这里由服务端读原始文件、按白名单类型受控转换。
 */
import fs from "fs";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { getDocumentRaw } from "./documentsDb.ts";
import { withPdfWorker } from "./pdfWorker.ts";
import { asString } from "./sqliteUtil.ts";
import { formatLocalDate } from "./localDate.ts";

/** 单张图片超过此大小不进打印（base64 后约 4/3 倍，再叠加会拖垮打印窗口） */
export const MAX_PRINT_IMAGE_BYTES = 8 * 1024 * 1024;
/** 单个 PDF 最多渲染页数（pdf-to-img 每页 ~200KB PNG，20 页已近 5MB） */
export const MAX_PRINT_PDF_PAGES = 20;
export const MAX_PRINT_TEXT_CHARS = 40_000;
export const MAX_PRINT_TABLE_ROWS = 500;
export const MAX_PRINT_TABLE_COLS = 30;

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};
const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "log"]);

export interface PrintPartBase {
  documentId: string;
  name: string;
}

export type PrintPart =
  | (PrintPartBase & { kind: "text"; text: string; truncated: boolean })
  | (PrintPartBase & {
      kind: "table";
      sheets: { name: string; rows: string[][] }[];
      truncated: boolean;
    })
  | (PrintPartBase & { kind: "pages"; pages: string[]; truncated: boolean; note?: string })
  | (PrintPartBase & { kind: "unsupported"; note: string });

/** 扩展名一律小写且不含点；老数据里 type 可能是中文名或空，回退到文件名后缀 */
function extOf(doc: { type?: unknown; name?: unknown }): string {
  const fromType = String(doc.type ?? "").toLowerCase().replace(/^\./, "");
  if (fromType) return fromType;
  const name = String(doc.name ?? "");
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * PDF 逐页转 PNG。
 *
 * 全局 pdf.js worker 的换入换出与串行由 withPdfWorker 统一负责 ——
 * 扫描件 OCR（wechatNoticeRouter）用的是同一条链，两处各自排队才会互相踩。
 */
async function renderPdfPages(
  buffer: Buffer,
  maxPages: number
): Promise<{ pages: Buffer[]; total: number }> {
  return withPdfWorker(async () => {
    const { pdf } = await import("pdf-to-img");
    const pages: Buffer[] = [];
    const doc = await pdf(buffer, { format: "png", scale: 2 });
    for await (const page of doc) {
      pages.push(page);
      if (pages.length >= maxPages) break;
    }
    return { pages, total: doc.length };
  });
}

/** Excel 取值 → 打印用字符串：数字不带浮点尾巴，日期取本地日，公式取结果 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatLocalDate(value);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text ?? "");
    if ("richText" in v) {
      const parts = (v.richText as { text?: string }[] | undefined) || [];
      return parts.map((p) => p.text ?? "").join("");
    }
    if ("hyperlink" in v) return String(v.text ?? v.hyperlink ?? "");
    return JSON.stringify(value);
  }
  return String(value);
}

async function buildPart(docId: string): Promise<PrintPart> {
  const doc = getDocumentRaw(docId);
  const base: PrintPartBase = { documentId: docId, name: asString(doc?.name) || docId };
  if (!doc) return { ...base, kind: "unsupported", note: "文档记录不存在" };

  const storedPath = asString(doc.storedPath);
  if (!storedPath || !fs.existsSync(storedPath)) {
    return { ...base, kind: "unsupported", note: "服务器上没有该文件的存储副本" };
  }

  const ext = extOf(doc);
  const unsupported = (note: string): PrintPart => ({ ...base, kind: "unsupported", note });

  if (IMAGE_EXTS.has(ext)) {
    const size = fs.statSync(storedPath).size;
    if (size > MAX_PRINT_IMAGE_BYTES) {
      return unsupported(`图片过大（${Math.round(size / 1024 / 1024)}MB），请下载后本地打印`);
    }
    const buffer = fs.readFileSync(storedPath);
    return {
      ...base,
      kind: "pages",
      pages: [toDataUrl(buffer, IMAGE_MIME[ext] || "application/octet-stream")],
      truncated: false,
    };
  }

  if (ext === "pdf") {
    try {
      const buffer = fs.readFileSync(storedPath);
      const { pages, total } = await renderPdfPages(buffer, MAX_PRINT_PDF_PAGES);
      if (pages.length === 0) return unsupported("PDF 未能渲染出任何页面");
      const truncated = total > pages.length;
      return {
        ...base,
        kind: "pages",
        pages: pages.map((p) => toDataUrl(p, "image/png")),
        truncated,
        note: truncated ? `共 ${total} 页，仅输出前 ${pages.length} 页` : undefined,
      };
    } catch (e) {
      return unsupported(`PDF 渲染失败：${(e as Error)?.message || "未知原因"}`);
    }
  }

  if (TEXT_EXTS.has(ext)) {
    const raw = fs.readFileSync(storedPath, "utf8");
    return {
      ...base,
      kind: "text",
      text: raw.slice(0, MAX_PRINT_TEXT_CHARS),
      truncated: raw.length > MAX_PRINT_TEXT_CHARS,
    };
  }

  if (ext === "docx") {
    try {
      const { value } = await mammoth.extractRawText({ buffer: fs.readFileSync(storedPath) });
      const text = String(value || "");
      if (!text.trim()) return unsupported("Word 文档没有可提取的正文（可能是纯图片或表格版式）");
      return {
        ...base,
        kind: "text",
        text: text.slice(0, MAX_PRINT_TEXT_CHARS),
        truncated: text.length > MAX_PRINT_TEXT_CHARS,
      };
    } catch (e) {
      return unsupported(`Word 解析失败：${(e as Error)?.message || "未知原因"}`);
    }
  }

  if (ext === "xlsx") {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(fs.readFileSync(storedPath) as unknown as ArrayBuffer);
      const sheets: { name: string; rows: string[][] }[] = [];
      let truncated = wb.worksheets.length > 10;
      wb.worksheets.slice(0, 10).forEach((ws, idx) => {
        const rows: string[][] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          if (rows.length >= MAX_PRINT_TABLE_ROWS) {
            truncated = true;
            return;
          }
          const cells: string[] = [];
          for (let c = 1; c <= Math.min(row.cellCount, MAX_PRINT_TABLE_COLS); c++) {
            cells.push(cellText(row.getCell(c).value));
          }
          rows.push(cells);
        });
        if (rows.length) sheets.push({ name: ws.name || `工作表 ${idx + 1}`, rows });
      });
      if (sheets.length === 0) return unsupported("Excel 没有可打印的数据");
      return { ...base, kind: "table", sheets, truncated };
    } catch (e) {
      return unsupported(`Excel 解析失败：${(e as Error)?.message || "未知原因"}`);
    }
  }

  return unsupported(`暂不支持 .${ext || "未知"} 类型的在线打印，请下载后本地打印`);
}

/** 供路由调用：单个文档的打印片段（文档不存在时返回 null） */
export async function buildPrintPart(documentId: string): Promise<PrintPart | null> {
  if (!getDocumentRaw(documentId)) return null;
  return buildPart(documentId);
}
