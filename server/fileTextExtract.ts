import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { formatLocalDate } from "./localDate.ts";
import { extractText, getDocumentProxy } from "unpdf";

/** 上传文件大小上限（字节） */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
/** 提取文本的输出上限：超出截断，防止把整本表格塞进 prompt */
export const MAX_TEXT_CHARS = 20_000;

/** 提取失败时抛出；router 按 400 返回给前端。 */
export class ExtractError extends Error {}

/** PDF 无文字层（扫描版/图片型）；noticeRouter 捕获后回退到视觉模型 OCR。 */
export class NoTextLayerError extends ExtractError {}

const SUPPORTED = /\.(txt|md|csv|xlsx|docx|pdf)$/i;

function extension(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

export function isSupportedFile(filename: string): boolean {
  return SUPPORTED.test(filename);
}

export function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n…（内容过长，已截断到 ${MAX_TEXT_CHARS} 字）`;
}

/** 按扩展名分发：txt/md/csv/xlsx/docx/pdf → 纯文本。 */
export async function extractFileText(filename: string, buffer: Buffer): Promise<string> {
  if (buffer.length === 0) throw new ExtractError("文件内容为空");
  const ext = extension(filename);
  let text: string;
  switch (ext) {
    case "txt":
    case "md":
    case "csv":
      text = decodeText(buffer);
      break;
    case "xlsx":
      text = await extractXlsx(buffer);
      break;
    case "docx":
      text = await extractDocx(buffer);
      break;
    case "pdf":
      text = await extractPdf(buffer);
      break;
    default:
      throw new ExtractError(`不支持的文件类型：${ext || "未知"}（支持 txt/md/csv/xlsx/docx/pdf）`);
  }
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) throw new ExtractError("未能从文件中提取到文本内容");
  return truncateText(trimmed);
}

/** 优先按 UTF-8 解码；乱码比例过高时回退 GBK（国内常见办公文本编码）。 */
function decodeText(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const bad = (utf8.match(/\uFFFD/g)?.length ?? 0) / Math.max(utf8.length, 1);
  if (bad > 0.02) {
    try {
      return new TextDecoder("gbk").decode(buffer);
    } catch {
      /* 环境不支持 GBK 时保留 UTF-8 结果 */
    }
  }
  return utf8;
}

/**
 * xlsx / docx 是压缩包：3MB 的表可以膨胀成几十万行（zip 炸弹）。
 * `MAX_FILE_BYTES` 只挡得住压缩后的体积，而真正吃内存的是"逐格转字符串再拼接"这一步 ——
 * 所以解压后再收一道行/格上限，到量就停（调用方还会把文本截到 MAX_TEXT_CHARS，
 * 多解出来的部分本来就用不上）。
 */
const MAX_SHEET_ROWS = 20_000;
const MAX_SHEET_CELLS = 200_000;

/** eachRow 没有 break，用哨兵异常中断遍历 */
class ExtractLimitReached extends Error {}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ExtractError("Excel 文件无法解析（请确认为 .xlsx 格式）");
  }
  const lines: string[] = [];
  let rows = 0;
  let cells = 0;
  try {
    wb.eachSheet((sheet) => {
      if (sheet.rowCount === 0) return;
      lines.push(`【工作表：${sheet.name}】`);
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (++rows > MAX_SHEET_ROWS || (cells += row.cellCount) > MAX_SHEET_CELLS) {
          throw new ExtractLimitReached();
        }
        const texts: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          texts.push(cellText(cell.value));
        });
        const line = texts.join(" | ").replace(/\s+$/, "");
        if (line.replace(/[|\s]/g, "")) lines.push(line);
      });
    });
  } catch (e) {
    if (!(e instanceof ExtractLimitReached)) throw e;
    lines.push(`…（表格过大，仅解析前 ${MAX_SHEET_ROWS} 行 / ${MAX_SHEET_CELLS} 格）`);
  }
  return lines.join("\n");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return formatLocalDate(value);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? "").join("");
    }
    if (typeof v.text === "string") return v.text;
    if (typeof v.result === "string" || typeof v.result === "number") return String(v.result);
    if (v.hyperlink) return String(v.text ?? v.hyperlink);
    return "";
  }
  return String(value);
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  } catch {
    throw new ExtractError("Word 文件无法解析（请确认为 .docx 格式）");
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  let text: string;
  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    // unpdf ≥1.3 返回 { text: string[], totalPages }；旧版直接返回 string[]
    const result = (await extractText(doc, { mergePages: true })) as string[] | { text?: string[] | string };
    const pages = Array.isArray(result) ? result : result.text ?? [];
    text = Array.isArray(pages) ? pages.join("\n") : String(pages);
  } catch {
    throw new ExtractError("PDF 文件无法解析（已损坏或受密码保护）");
  }
  if (!text.replace(/\s+/g, "")) {
    throw new NoTextLayerError("该 PDF 没有文字层（扫描版/图片型）");
  }
  return text;
}
