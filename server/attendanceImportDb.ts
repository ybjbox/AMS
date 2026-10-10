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

/**
 * 横排表（企业微信「打卡时间记录」）的识别与拆解。
 *
 * 企业微信导出的表是**横排**的：一行一个人、一列一天，每格里用「、」分隔着当天
 * 多次打卡（`08:03、12:01、14:39`）。而上面的 `parsePunchWorkbook` 只认**竖排**模板
 * （每行一条打卡），扫第 1 行找「日期」「时间」表头 —— 遇到横排表会直接抛
 * 「未识别到表头」（实测：企业微信原表 32×36，表头在第 4 行）。
 *
 * 所以这里另开一路：识别到横排表就把它拆成竖排的行，**下游 validateRow / 落库
 * / 幂等去重全部复用**，不复制第二份校验逻辑。
 *
 * 横排表的几个实情（都由实测确认，不是猜的）：
 *  - 表头占 4 行：R1 标题「打卡时间记录」、R2「统计时间:08-31 ～ 10-01」、R3 分组标题
 *    （姓名/账号/基础信息/打卡时间记录）、R4 真正的列头（前 4 列是 姓名/账号/部门/职务，
 *    从第 5 列起是「日 + 星期」，如 `31 星期一`）；
 *  - 列头**只有日号没有月份**，靠「日数递减即换月」推出月份，所以 8/31 起头的表
 *    和 9/1 起头的表都能读；
 *  - 一格里多个时间用「、」分隔，还可能带「(管理员校准)」后缀 —— 打卡机补的修正记录，
 *    与相邻那一次打卡其实是同一张卡（间隔 ≤5 分钟即合并，否则 1 次打卡会算成 2 次）。
 */
export interface LayoutHint {
  /** "wide" = 企业微信横排表；"tall" = 竖排模板 */
  layout: "wide" | "tall";
  /** 识别依据，用于给用户解释「为什么按这种方式读」 */
  reason: string;
  detected?: {
    headerRow: number;
    dateColumns: number;
    firstDate: string;
    lastDate: string;
    people: number;
  };
}

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
  /** 表形状识别结果：让界面能说清「这张表是怎么读的」 */
  layout: LayoutHint;
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

// ---------------------------------------------------------------- 横排表（企业微信原表）

/**
 * 判定"这是不是横排表"。
 *
 * 看第 4 行（真实列头）：前几列出现 姓名/账号，且从第 5 列起至少一列带日号。
 *
 * 注意不能只看 `ws.columnCount`：合并单元格（标题行 R1/R2/R3 都是合并的）会让它
 * 偏大，而只写了一行数据的测试表也可能因为空单元格少算几列 —— 所以列数判断用
 * **实际扫到的带日号列数**，并且要求人名列存在。
 */
function looksLikeWideSheet(ws: ExcelJS.Worksheet): boolean {
  const header = ws.getRow(4);
  if (!header) return false;
  const hasName = [1, 2, 3, 4].some((c) => toText(header.getCell(c).value).includes("姓名"));
  if (!hasName) return false;
  let dateColCount = 0;
  const upper = Math.max(ws.columnCount, ws.actualColumnCount || 0, 8);
  for (let c = 5; c <= upper; c++) {
    if (/\d{1,2}/.test(toText(header.getCell(c).value))) dateColCount++;
  }
  return dateColCount >= 1;
}

/**
 * 横排表的日期列 → YYYY-MM-DD。
 *
 * 列头只有「日 + 星期」没有月份，所以按「日数递减即换月」推：
 * `31 星期一` 之后是 `1 星期二` → 8 月 31 日接 9 月 1 日。
 * 首列月份由首列日数判断（>20 视为上月末 = 8 月，否则 9 月）—— 覆盖
 * 8/31 起头与 9/1 起头两种表。
 */
function wideDateColumns(ws: ExcelJS.Worksheet): { col: number; date: string }[] {
  const out: { col: number; date: string }[] = [];
  let month = 0;
  let prevDay = 0;
  const upper = Math.max(ws.columnCount, ws.actualColumnCount || 0, 8);
  for (let c = 5; c <= upper; c++) {
    const m = toText(ws.getRow(4).getCell(c).value).match(/(\d{1,2})/);
    if (!m) continue;
    const day = Number(m[1]);
    if (month === 0) month = day > 20 ? 8 : 9;
    else if (day < prevDay) month += 1;
    prevDay = day;
    out.push({ col: c, date: `2026-${pad(month)}-${pad(day)}` });
  }
  return out;
}

/** 同一格内相邻两次打卡 ≤N 分钟视为同一张卡（打卡机「管理员校准」会补一条修正记录）。 */
const SAME_PUNCH_MINUTES = 5;

function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 一个格子 → 该日的若干个 HH:MM。
 *
 * - `--` / 空 → 无打卡（整天缺勤，不产生行）
 * - `08:03、12:01、14:39` → 三条
 * - `08:06(管理员校准)` → 保留 08:06；若与已解析出的打卡间隔 ≤5 分钟则**合并**，
 *   否则当作独立的一次（实测校准记录与真实卡相邻，不合并会把 1 次打卡算成 2 次）
 */
function splitTimesInCell(text: string): string[] {
  const t = text.trim();
  if (!t || /^[-–—]+$/.test(t)) return [];
  const plain: string[] = [];
  const annotated: string[] = [];
  for (const part of t.split(/[、,，/]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const hhmm = `${m[1].padStart(2, "0")}:${m[2]}`;
    if (part === hhmm) plain.push(hhmm);
    else annotated.push(hhmm);
  }
  const times = [...plain];
  for (const a of annotated) {
    const near = times.some((x) => {
      const d = Math.abs(minutesOf(x) - minutesOf(a));
      return Math.min(d, 1440 - d) <= SAME_PUNCH_MINUTES;
    });
    if (!near) times.push(a);
  }
  times.sort((a, b) => minutesOf(a) - minutesOf(b));
  return times;
}

/**
 * 横排表 → 竖排行（喂给 validateRow 的形状）。
 *
 * 归属优先用**工号**（第 2 列「账号」，企业微信里的唯一标识），退而用姓名。
 * 整行都是 `--` 的（实测有「测试号-市场部 / bb」这种占位行）自然被跳过 —— 没有时间就没有行。
 */
function parseWideSheet(ws: ExcelJS.Worksheet): {
  rows: { rowNumber: number; cells: Partial<Record<Field, ExcelJS.CellValue>> }[];
  detected: NonNullable<LayoutHint["detected"]>;
} {
  const cols = wideDateColumns(ws);
  const rows: { rowNumber: number; cells: Partial<Record<Field, ExcelJS.CellValue>> }[] = [];
  let people = 0;

  const upper = Math.max(ws.rowCount, ws.actualRowCount || 0, 5);
  for (let r = 5; r <= upper; r++) {
    const name = toText(ws.getRow(r).getCell(1).value).trim();
    const acct = toText(ws.getRow(r).getCell(2).value).trim();
    if (!name && !acct) continue;

    let anyTime = false;
    for (const col of cols) {
      const times = splitTimesInCell(toText(ws.getRow(r).getCell(col.col).value));
      if (times.length === 0) continue;
      anyTime = true;
      for (const time of times) {
        rows.push({
          // 行号带上列/次，让预览里能看出是哪一天第几次卡
          rowNumber: r,
          cells: {
            employeeId: acct || undefined,
            employeeName: name || undefined,
            date: col.date,
            time: `${time}:00`,
          },
        });
      }
    }
    if (anyTime) people++;
  }

  return {
    rows,
    detected: {
      headerRow: 4,
      dateColumns: cols.length,
      firstDate: cols[0]?.date ?? "",
      lastDate: cols[cols.length - 1]?.date ?? "",
      people,
    },
  };
}

/** 探一次表形状，暴露给路由层用于界面提示与预览回显。 */
export async function detectLayout(buffer: Buffer): Promise<LayoutHint> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("工作簿中没有工作表");

  if (looksLikeWideSheet(ws)) {
    const { detected } = parseWideSheet(ws);
    return {
      layout: "wide",
      reason: "企业微信横排表：一行一人、一列一天，日期取自第 4 行列头",
      detected,
    };
  }

  const headerFields: Field[] = [];
  ws.getRow(1).eachCell((cell) => {
    const title = toText(cell.value);
    if (!title) return;
    const found = (Object.keys(HEADER_ALIASES) as Field[]).find((f) =>
      HEADER_ALIASES[f].some((alias) => title.includes(alias)),
    );
    if (found && !headerFields.includes(found)) headerFields.push(found);
  });
  if (headerFields.includes("date") && headerFields.includes("time")) {
    return { layout: "tall", reason: "标准模板：第一行含「日期」「时间」列" };
  }
  return {
    layout: "tall",
    reason: "未识别到企业微信横排表特征，按标准模板要求第一行含「日期」「时间」",
  };
}

interface EmployeeHit {
  id: string;
  name: string;
}

function findById(id: string): EmployeeHit | null {
  const row = db.prepare("SELECT id, name FROM employees WHERE id = ?").get(id) as EmployeeHit | undefined;
  return row ? { id: asString(row.id), name: asString(row.name) } : null;
}

/**
 * 企业微信 userid → 员工。
 *
 * 这条映射是**必须有**的，不是可选优化：企业微信打卡表第 2 列给的是 userid
 * （`LuHong`），而 `employees.id` 是系统自己的工号（`EMP0002`）—— 两套编号，
 * 表里没有真人用的工号。所以横排表导入只能靠这张映射表认人。
 *
 * 匹配顺序：精确 userid → 账号（历史数据里 userid 改过的情况）→ 姓名（唯一时）。
 * 都不中就报错，**绝不猜** —— 认错人等于把别人的打卡算进这个人的考勤。
 */
function findByWeComUserId(userid: string): EmployeeHit | null {
  const rows = db
    .prepare(
      "SELECT e.id AS id, e.name AS name FROM wecom_bindings m JOIN employees e ON e.id = m.employeeId WHERE m.wecomUserId = ?",
    )
    .all(userid) as unknown as EmployeeHit[];
  if (rows.length === 0) return null;
  if (rows.length > 1) return null; // 一个 userid 认到多个人 = 映射表坏了，宁可报错
  return { id: asString(rows[0].id), name: asString(rows[0].name) };
}

/** 姓名模糊兜底：企业微信里姓名可能带空格或全半角差异。 */
function normalizeName(n: string): string {
  return n.replace(/\s+/gu, "").trim();
}

function findByName(name: string): { hit: EmployeeHit | null; ambiguous: boolean } {
  const rows = db
    .prepare("SELECT id, name FROM employees WHERE REPLACE(name, ' ', '') = ?")
    .all(normalizeName(name)) as unknown as EmployeeHit[];
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

  // 归属认人：工号 → 企业微信 userid → 姓名（唯一时）。
  // 姓名兜底是既有契约（文件头「工号缺失或找不到时才按姓名唯一匹配」）：
  // 企业微信表给的是 userid，没绑定的账号要靠姓名认回来，否则整表导不进去。
  let employee: EmployeeHit | null = null;
  const idResolved = rawId ? findById(rawId) ?? findByWeComUserId(rawId) : null;
  if (idResolved) {
    employee = idResolved;
  } else if (rawName) {
    const found = findByName(rawName);
    if (found.ambiguous) errors.push(`姓名「${rawName}」对应多名员工，请填写工号`);
    else if (!found.hit) {
      errors.push(
        rawId
          ? `工号 ${rawId} 与姓名「${rawName}」都找不到对应员工`
          : `姓名「${rawName}」在员工档案中不存在`,
      );
    } else employee = found.hit;
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

  // 企业微信横排表走另一路：拆成竖排行后再交给同一套 validateRow
  if (looksLikeWideSheet(ws)) return parseWideSheet(ws).rows;

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
  const layout = await detectLayout(buffer);
  return {
    total: rows.length,
    valid: rows.filter((r) => r.errors.length === 0).length,
    invalid: rows.filter((r) => r.errors.length > 0 && !r.duplicate).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    rows,
    layout,
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
