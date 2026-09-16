/**
 * 员工批量导入（P1：Excel 模板导入，对齐考勤导入体验的完整闭环）。
 *
 * 流程：POST /api/users/import（上传 xlsx → 解析 + 校验 + 预览）→
 *      用户确认 → POST /api/users/import/commit（服务端二次校验后落库）。
 *
 * 设计：
 * - 服务端解析（exceljs），前端不引入解析依赖
 * - 预览阶段逐行给出：errors[]（阻断问题）/ duplicate（身份证号重复）
 * - 提交阶段服务端重新校验（不信任客户端），只落库完全合法的行
 * - 部门名称校验：必须匹配现有部门树（避免导入后部门外键悬空）
 */
import ExcelJS from "exceljs";
import { db } from "./db.ts";
import { createEmployee } from "./db.ts";
import { asString } from "./sqliteUtil.ts";

/** 模板列定义（顺序即模板列顺序） */
const COLUMNS: { header: string; field: string; width: number; required: boolean }[] = [
  { header: "姓名", field: "name", width: 12, required: true },
  { header: "身份证号", field: "idCard", width: 22, required: true },
  { header: "性别", field: "gender", width: 8, required: false },
  { header: "年龄", field: "age", width: 8, required: false },
  { header: "电话", field: "phone", width: 15, required: true },
  { header: "部门", field: "department", width: 14, required: true },
  { header: "职位", field: "role", width: 14, required: false },
  { header: "状态", field: "status", width: 10, required: false },
  { header: "入职日期", field: "joinDate", width: 14, required: true },
  { header: "用工形式", field: "employmentType", width: 12, required: false },
  { header: "合同年限", field: "contractYears", width: 10, required: false },
  { header: "合同签订日期", field: "contractSignDate", width: 16, required: false },
  { header: "合同到期日期", field: "contractExpiry", width: 16, required: false },
  { header: "备注", field: "remarks", width: 20, required: false },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ImportRowResult {
  rowNumber: number;
  data: Record<string, string | number>;
  errors: string[];
  /** 身份证号在库中或文件内重复 */
  duplicate: boolean;
}

export interface ImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: ImportRowResult[];
}

/** Excel 单元格值 → 字符串（处理日期/富文本/公式结果） */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel 日期 → YYYY-MM-DD（按本地时区，常见导入场景足够）
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
  }
  return String(value).trim();
}

/** 解析工作簿 → 原始行（未校验） */
export function parseWorkbook(buffer: Buffer): { rowNumber: number; raw: Record<string, string> }[] {
  return parseWorkbookSync(buffer);
}

// exceljs 的 load 是异步 API；这里提供异步版本供路由 await
export async function parseWorkbookAsync(
  buffer: Buffer
): Promise<{ rowNumber: number; raw: Record<string, string> }[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs 类型声明要求 Buffer 断言（运行时完全支持 Buffer）
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("工作簿中没有工作表");

  // 表头映射：标题 → 列号
  const headerByCol = new Map<number, string>();
  ws.getRow(1).eachCell((cell, col) => {
    const title = cellText(cell.value);
    if (title) headerByCol.set(col, title);
  });

  const fieldByCol = new Map<number, string>();
  for (const [col, title] of headerByCol) {
    const found = COLUMNS.find((c) => title.includes(c.header));
    if (found) fieldByCol.set(col, found.field);
  }
  if (![...fieldByCol.values()].includes("name")) {
    throw new Error("未识别到表头：请使用下载的模板（第一行需包含「姓名」列）");
  }

  const rows: { rowNumber: number; raw: Record<string, string> }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 表头
    const raw: Record<string, string> = {};
    let hasContent = false;
    row.eachCell((cell, col) => {
      const field = fieldByCol.get(col);
      if (!field) return;
      const text = cellText(cell.value);
      if (text) hasContent = true;
      raw[field] = text;
    });
    if (hasContent) rows.push({ rowNumber, raw });
  });
  return rows;
}

/** 同步解析（供测试/内部工具使用；路由用异步版） */
function parseWorkbookSync(buffer: Buffer): { rowNumber: number; raw: Record<string, string> }[] {
  void buffer;
  throw new Error("parseWorkbook 请使用 parseWorkbookAsync");
}

/** 校验：单行 → 结果（含错误清单与重复检测） */
function validateRow(
  raw: Record<string, string>,
  existingIdCards: Set<string>,
  seenIdCards: Set<string>
): { data: Record<string, string | number>; errors: string[]; duplicate: boolean } {
  const errors: string[] = [];
  const data: Record<string, string | number> = {};

  for (const col of COLUMNS) {
    const value = (raw[col.field] ?? "").trim();
    if (!value) {
      if (col.required) errors.push(`缺少${col.header}`);
      continue;
    }
    data[col.field] = value;
  }

  // 格式校验
  if (typeof data.idCard === "string" && !/^\d{17}[\dXx]$/.test(data.idCard)) {
    errors.push("身份证号格式不正确（应为 18 位）");
  }
  if (typeof data.phone === "string" && !/^1\d{10}$/.test(data.phone)) {
    errors.push("电话格式不正确（应为 11 位手机号）");
  }
  for (const dateField of ["joinDate", "contractSignDate", "contractExpiry"] as const) {
    const v = data[dateField];
    if (typeof v === "string" && !DATE_RE.test(v)) {
      errors.push(`${dateField === "joinDate" ? "入职日期" : dateField === "contractSignDate" ? "合同签订日期" : "合同到期日期"}格式应为 YYYY-MM-DD`);
    }
  }
  if (typeof data.age === "string") {
    const age = parseInt(data.age, 10);
    if (Number.isFinite(age) && age >= 0 && age <= 200) data.age = age;
    else delete data.age;
  }
  if (typeof data.contractYears === "string") {
    const years = parseInt(data.contractYears, 10);
    if (Number.isFinite(years) && years >= 0 && years <= 50) data.contractYears = years;
    else delete data.contractYears;
  }

  // 部门存在性校验
  if (typeof data.department === "string") {
    const exists = db
      .prepare("SELECT 1 FROM departments WHERE name = ?")
      .get(data.department);
    if (!exists) {
      errors.push(`部门「${data.department}」不存在（请先在部门管理中添加）`);
    }
  }

  // 身份证重复：与库内 + 文件内
  const idCard = typeof data.idCard === "string" ? data.idCard.toUpperCase() : "";
  let duplicate = false;
  if (idCard) {
    if (existingIdCards.has(idCard)) {
      duplicate = true;
      errors.push("身份证号已存在于员工库");
    } else if (seenIdCards.has(idCard)) {
      duplicate = true;
      errors.push("身份证号在文件内重复");
    }
    seenIdCards.add(idCard);
  }

  // 默认值
  if (!data.status) data.status = "在职";
  if (!data.employmentType) data.employmentType = "正式";

  return { data, errors, duplicate };
}

/** 预览：解析 + 校验全部行 */
export async function previewImport(buffer: Buffer): Promise<ImportPreview> {
  const rows = await parseWorkbookAsync(buffer);
  if (rows.length === 0) throw new Error("文件中没有数据行");
  if (rows.length > 500) throw new Error("单次最多导入 500 行");

  const existing = db
    .prepare("SELECT idCard FROM employees WHERE idCard IS NOT NULL AND idCard != ''")
    .all()
    .map((r) => asString(r.idCard).toUpperCase());
  const existingIdCards = new Set(existing);

  const seenIdCards = new Set<string>();
  const results: ImportRowResult[] = rows.map(({ rowNumber, raw }) => {
    const { data, errors, duplicate } = validateRow(raw, existingIdCards, seenIdCards);
    return { rowNumber, data, errors, duplicate };
  });

  const valid = results.filter((r) => r.errors.length === 0).length;
  return {
    total: results.length,
    valid,
    invalid: results.filter((r) => r.errors.length > 0 && !r.duplicate).length,
    duplicates: results.filter((r) => r.duplicate).length,
    rows: results,
  };
}

/** 提交：服务端二次校验后落库（只插入完全合法的行） */
export function commitImport(rows: { data: Record<string, string | number> }[]): {
  created: number;
  skipped: number;
  ids: string[];
} {
  const existing = db
    .prepare("SELECT idCard FROM employees WHERE idCard IS NOT NULL AND idCard != ''")
    .all()
    .map((r) => asString(r.idCard).toUpperCase());
  const existingIdCards = new Set(existing);
  const seenIdCards = new Set<string>();

  let created = 0;
  let skipped = 0;
  const ids: string[] = [];

  for (const row of rows) {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(row.data ?? {})) {
      raw[k] = v === null || v === undefined ? "" : String(v);
    }
    const { data, errors } = validateRow(raw, existingIdCards, seenIdCards);
    if (errors.length > 0) {
      skipped++;
      continue;
    }
    const emp = createEmployee(data);
    if (emp) {
      created++;
      ids.push(asString(emp.id));
      const ic = typeof data.idCard === "string" ? data.idCard.toUpperCase() : "";
      if (ic) existingIdCards.add(ic);
    } else {
      skipped++;
    }
  }

  return { created, skipped, ids };
}

/** 生成导入模板（含示例行与说明） */
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("员工导入");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
  // 示例行（用户可删除后填入真实数据）
  ws.addRow({
    name: "张三",
    idCard: "110101199001011234",
    gender: "男",
    age: 30,
    phone: "13800000000",
    department: "研发部",
    role: "前端工程师",
    status: "在职",
    joinDate: "2026-01-01",
    employmentType: "正式",
    contractYears: 3,
    contractSignDate: "2026-01-01",
    contractExpiry: "2029-01-01",
    remarks: "示例行，导入前请删除",
  });
  ws.getRow(1).font = { bold: true };
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
