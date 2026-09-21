/**
 * 考勤打卡记录批量导入（服务端解析）。
 *
 * 流程与员工导入一致：上传 xlsx → 解析 + 逐行校验 + 预览 → 用户确认 → 后台分块落库，
 * 前端轮询 /api/attendance/records/import/jobs/:id 看进度。
 *
 * 两个设计约束：
 * - 解析放服务端：前端解析要么引入 SheetJS（包体与双份真相），要么只能"看起来导入成功"。
 * - 落库幂等：统一走 punch_records 的 (employeeId, date, time) 唯一索引 +
 *   ON CONFLICT DO NOTHING，所以同一张表反复导入不会堆重复记录。
 * - 归属以工号为准；工号缺失或找不到时才按姓名唯一匹配，姓名对不上/重名一律标错而不是猜。
 */
import ExcelJS from "exceljs";
import { db } from "./db.ts";
import { asString } from "./sqliteUtil.ts";
import { upsertRecord } from "./attendanceDb.ts";
import { markJobDone, markJobError, markJobProgress } from "./importJobsDb.ts";

/** 单次导入行数上限（与员工导入同一量级） */
export const MAX_PUNCH_IMPORT_ROWS = 5000;

const CHUNK_SIZE = 100;

type Field = "employeeId" | "employeeName" | "date" | "time";

/** 表头别名：不同考勤机导出的列名不统一，这里按包含关系匹配 */
const HEADER_ALIASES: Record<Field, string[]> = {
  employeeId: ["工号", "员工编号", "编号", "账号"],
  employeeName: ["姓名", "员工姓名"],
  date: ["日期", "打卡日期"],
  time: ["时间", "打卡时间"],
};

export interface AttendanceImportRowResult {
  rowNumber: number;
  data: { employeeId: string; employeeName: string; date: string; time: string };
  errors: string[];
  /** 与库中已有记录或文件内前序行重复 */
  duplicate: boolean;
}

export interface AttendanceImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: AttendanceImportRowResult[];
}

function toText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("").trim();
    if ("result" in value) return toText(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("error" in value) return "";
    return "";
  }
  return String(value).trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Excel 日期序列号 → YYYY-MM-DD（1900 历法下 1899-12-30 为第 0 天） */
function serialToDate(n: number): string | null {
  if (!Number.isFinite(n) || n < 20_000 || n > 80_000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 日期单元格 → YYYY-MM-DD；兼容 Date、序列号、2026/1/5、2026.1.5、2026年1月5日 */
export function parseDateCell(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "number") return serialToDate(value);
  const text = toText(value).trim();
  if (!text) return null;
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(text);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  const serial = /^\d{5}(\.\d+)?$/.exec(text);
  if (serial) return serialToDate(Number(text));
  return null;
}

/** 时间单元格 → HH:MM:SS；兼容 Date/序列小数（0.375=09:00）与 9:00、09:00:00、9：00 */
export function parseTimeCell(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  if (typeof value === "number") {
    const frac = ((value % 1) + 1) % 1;
    const secs = Math.round(frac * 86_400) % 86_400;
    return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  }
  const text = toText(value).trim().replace(/[：.]/g, ":");
  if (!text) return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
  if (m) return `${pad(Number(m[1]))}:${m[2]}:${m[3] ?? "00"}`;
  return null;
}

interface EmployeeHit {
  id: string;
  name: string;
}

function findById(id: string): EmployeeHit | null {
  const row = db.prepare("SELECT id, name FROM employees WHERE id = ?").get(id) as EmployeeHit | undefined;
  return row ? { id: asString(row.id), name: asString(row.name) } : null;
}

function findByName(name: string): { hit: EmployeeHit | null; ambiguous: boolean } {
  const rows = db.prepare("SELECT id, name FROM employees WHERE name = ?").all(name) as unknown as EmployeeHit[];
  if (rows.length === 0) return { hit: null, ambiguous: false };
  if (rows.length > 1) return { hit: null, ambiguous: true };
  return { hit: { id: asString(rows[0].id), name: asString(rows[0].name) }, ambiguous: false };
}

function existsInDb(employeeId: string, date: string, time: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM punch_records WHERE employeeId = ? AND date = ? AND time = ?")
    .get(employeeId, date, time);
}

/** 单行校验（预览与提交共用，提交时服务端再跑一遍，不信任客户端回传） */
function validateRow(
  cells: Partial<Record<Field, ExcelJS.CellValue>>,
  seen: Set<string>
): { data: AttendanceImportRowResult["data"]; errors: string[]; duplicate: boolean } {
  const errors: string[] = [];
  const rawId = toText(cells.employeeId ?? "");
  const rawName = toText(cells.employeeName ?? "");

  let employee: EmployeeHit | null = null;
  if (rawId) {
    employee = findById(rawId);
    if (!employee) errors.push(`工号 ${rawId} 在员工档案中不存在`);
  } else if (rawName) {
    const found = findByName(rawName);
    if (found.ambiguous) errors.push(`姓名「${rawName}」对应多名员工，请填写工号`);
    else if (!found.hit) errors.push(`姓名「${rawName}」在员工档案中不存在`);
    else employee = found.hit;
  } else {
    errors.push("缺少工号或姓名");
  }

  const date = parseDateCell(cells.date ?? "");
  if (!date) errors.push("日期格式应为 YYYY-MM-DD（或 Excel 日期）");
  const time = parseTimeCell(cells.time ?? "");
  if (!time) errors.push("时间格式应为 HH:MM 或 HH:MM:SS（或 Excel 时间）");

  let duplicate = false;
  const data = {
    employeeId: employee?.id ?? rawId,
    employeeName: employee?.name ?? rawName,
    date: date ?? "",
    time: time ?? "",
  };
  if (employee && date && time) {
    // 年份离谱通常是日期列被当成文本或序列号解析错了，直接挡掉比写进库再修便宜
    if (date < "2000-01-01" || date > isoAfterTomorrow()) {
      errors.push(`日期 ${date} 不在合理范围内`);
    } else {
      const key = `${employee.id}|${date}|${time}`;
      if (seen.has(key)) {
        duplicate = true;
        errors.push("文件内重复（与前面某行同一分钟）");
      } else if (existsInDb(employee.id, date, time)) {
        duplicate = true;
        errors.push("库中已存在该分钟打卡，导入时将跳过");
      } else {
        seen.add(key);
      }
    }
  }
  return { data, errors, duplicate };
}

function isoAfterTomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 解析工作簿 → 每行的字段单元格（保留 Date/number 原始类型，避免时间列被日期化） */
export async function parsePunchWorkbook(
  buffer: Buffer
): Promise<{ rowNumber: number; cells: Partial<Record<Field, ExcelJS.CellValue>> }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("工作簿中没有工作表");

  const fieldByCol = new Map<number, Field>();
  ws.getRow(1).eachCell((cell, col) => {
    const title = toText(cell.value);
    if (!title) return;
    const found = (Object.keys(HEADER_ALIASES) as Field[]).find((f) =>
      HEADER_ALIASES[f].some((alias) => title.includes(alias))
    );
    if (found) fieldByCol.set(col, found);
  });
  if (![...fieldByCol.values()].includes("date") || ![...fieldByCol.values()].includes("time")) {
    throw new Error("未识别到表头：请使用下载的模板（第一行需包含「日期」「时间」列）");
  }

  const rows: { rowNumber: number; cells: Partial<Record<Field, ExcelJS.CellValue>> }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Partial<Record<Field, ExcelJS.CellValue>> = {};
    let hasContent = false;
    row.eachCell((cell, col) => {
      const field = fieldByCol.get(col);
      if (!field) return;
      cells[field] = cell.value;
      if (toText(cell.value)) hasContent = true;
    });
    if (hasContent) rows.push({ rowNumber, cells });
  });
  return rows;
}

/** 预览：解析 + 逐行校验 */
export async function previewAttendanceImport(buffer: Buffer): Promise<AttendanceImportPreview> {
  const parsed = await parsePunchWorkbook(buffer);
  if (parsed.length === 0) throw new Error("文件中没有数据行");
  if (parsed.length > MAX_PUNCH_IMPORT_ROWS) {
    throw new Error(`单次最多导入 ${MAX_PUNCH_IMPORT_ROWS} 行，当前 ${parsed.length} 行`);
  }
  const seen = new Set<string>();
  const rows = parsed.map(({ rowNumber, cells }) => ({ rowNumber, ...validateRow(cells, seen) }));
  return {
    total: rows.length,
    valid: rows.filter((r) => r.errors.length === 0).length,
    invalid: rows.filter((r) => r.errors.length > 0 && !r.duplicate).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    rows,
  };
}

export interface AttendanceCommitState {
  seen: Set<string>;
  created: number;
  skipped: number;
}

export function beginAttendanceImportCommit(): AttendanceCommitState {
  return { seen: new Set<string>(), created: 0, skipped: 0 };
}

/** 落库一个分块：只写完全合法的行，重复行由唯一索引兜住并计入 skipped */
export function commitAttendanceChunk(
  state: AttendanceCommitState,
  rows: { data: AttendanceImportRowResult["data"] }[]
): void {
  for (const row of rows) {
    const raw: Partial<Record<Field, ExcelJS.CellValue>> = {
      employeeId: row.data?.employeeId ?? "",
      employeeName: row.data?.employeeName ?? "",
      date: row.data?.date ?? "",
      time: row.data?.time ?? "",
    };
    const { data, errors, duplicate } = validateRow(raw, state.seen);
    if (errors.length > 0 || duplicate) {
      state.skipped++;
      continue;
    }
    // 校验通过说明库里没有同一分钟的行；万一两次导入并发撞上，
    // upsertRecord 的 ON CONFLICT DO NOTHING 会把它收敛成同一行，不会堆重复
    upsertRecord(data);
    state.created++;
  }
}

/**
 * 后台执行考勤导入（路由已先返回 202）。异常一律落进 job.error，不外抛。
 * 与 runImportJob 分开是因为那里的分块器绑死了员工档案的提交函数；
 * 任务表与进度口径共用 importJobsDb 的那几个 mark* 函数。
 */
export async function runAttendanceImportJob(
  jobId: string,
  rows: { data: AttendanceImportRowResult["data"] }[]
): Promise<void> {
  try {
    const state = beginAttendanceImportCommit();
    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      commitAttendanceChunk(state, rows.slice(offset, offset + CHUNK_SIZE));
      markJobProgress(jobId, Math.min(offset + CHUNK_SIZE, rows.length), state.created, state.skipped);
      await new Promise((resolve) => setImmediate(resolve));
    }
    markJobDone(jobId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[attendance-import] 后台任务失败：", jobId, e);
    markJobError(jobId, message);
  }
}

/** 生成导入模板（含一行示例，导入前请删除） */
export async function buildAttendanceTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("打卡记录导入");
  ws.columns = [
    { header: "工号", key: "employeeId", width: 14 },
    { header: "姓名", key: "employeeName", width: 12 },
    { header: "日期", key: "date", width: 14 },
    { header: "时间", key: "time", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ employeeId: "EMP0001", employeeName: "张三", date: "2026-09-01", time: "09:00" });
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
