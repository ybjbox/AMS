import fs from "fs/promises";
import path from "path";

/**
 * 导出脚本模板的安全存取层。
 *
 * 安全要点：
 * 1. 模板名走严格白名单正则，杜绝 ../、绝对路径、NUL 字节等路径穿越写法。
 * 2. 落盘前再做一次 path.resolve 目录包含校验（双保险，防正则被绕过）。
 * 3. 限制模板代码体积，避免磁盘/内存被打爆。
 */

export const TEMPLATES_DIR = path.resolve(process.cwd(), "server", "templates");

/** 单个模板代码最大体积 */
export const MAX_TEMPLATE_BYTES = 64 * 1024;
/** 模板目录内最多保留多少个模板 */
export const MAX_TEMPLATE_COUNT = 50;

/** 只允许中英文、数字、下划线、连字符，长度 1~64 */
const NAME_PATTERN = /^[A-Za-z0-9_\-\u4E00-\u9FA5]{1,64}$/;

export class TemplateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TemplateError";
    this.status = status;
  }
}

/** 归一化并校验模板名（去掉 .js 后缀后校验） */
export function normalizeTemplateName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new TemplateError("模板名必须是字符串");
  }
  const trimmed = raw.trim();
  const base = trimmed.toLowerCase().endsWith(".js") ? trimmed.slice(0, -3) : trimmed;
  if (!NAME_PATTERN.test(base)) {
    throw new TemplateError("模板名只允许中英文、数字、下划线和连字符，长度 1-64");
  }
  // 额外兜底：显式拒绝任何分隔符与相对路径片段
  if (base.includes("/") || base.includes("\\") || base === "." || base === "..") {
    throw new TemplateError("非法模板名");
  }
  return base;
}

/** 解析模板绝对路径，并确保其仍在 TEMPLATES_DIR 之内 */
export function resolveTemplatePath(rawName: unknown): string {
  const safeName = normalizeTemplateName(rawName);
  const full = path.resolve(TEMPLATES_DIR, `${safeName}.js`);
  const rootPrefix = TEMPLATES_DIR.endsWith(path.sep) ? TEMPLATES_DIR : TEMPLATES_DIR + path.sep;
  if (!full.startsWith(rootPrefix)) {
    throw new TemplateError("非法模板路径");
  }
  return full;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
}

export interface TemplateRecord {
  name: string;
  code: string;
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  await ensureDir();
  const files = await fs.readdir(TEMPLATES_DIR);
  const jsFiles = files.filter((f) => f.toLowerCase().endsWith(".js"));

  const records: TemplateRecord[] = [];
  for (const file of jsFiles) {
    const name = file.slice(0, -3);
    // 目录里若混入了不合规文件名，直接跳过而不是抛错
    if (!NAME_PATTERN.test(name)) continue;
    try {
      const code = await fs.readFile(path.join(TEMPLATES_DIR, file), "utf-8");
      records.push({ name, code });
    } catch {
      /* 单个文件读取失败不影响整体列表 */
    }
  }
  return records;
}

export async function readTemplate(rawName: unknown): Promise<string> {
  const full = resolveTemplatePath(rawName);
  try {
    return await fs.readFile(full, "utf-8");
  } catch {
    throw new TemplateError("模板不存在", 404);
  }
}

export async function writeTemplate(rawName: unknown, rawCode: unknown): Promise<string> {
  const safeName = normalizeTemplateName(rawName);
  if (typeof rawCode !== "string") {
    throw new TemplateError("模板代码必须是字符串");
  }
  if (rawCode.trim().length === 0) {
    throw new TemplateError("模板代码不能为空");
  }
  const byteLength = Buffer.byteLength(rawCode, "utf-8");
  if (byteLength > MAX_TEMPLATE_BYTES) {
    throw new TemplateError(`模板代码超过体积上限（${Math.floor(MAX_TEMPLATE_BYTES / 1024)}KB）`);
  }

  await ensureDir();
  const existing = await listTemplates();
  const isNew = !existing.some((t) => t.name === safeName);
  if (isNew && existing.length >= MAX_TEMPLATE_COUNT) {
    throw new TemplateError(`模板数量已达上限（${MAX_TEMPLATE_COUNT} 个）`);
  }

  await fs.writeFile(resolveTemplatePath(safeName), rawCode, "utf-8");
  return safeName;
}

export async function deleteTemplate(rawName: unknown): Promise<void> {
  const full = resolveTemplatePath(rawName);
  try {
    await fs.unlink(full);
  } catch {
    throw new TemplateError("模板不存在", 404);
  }
}
