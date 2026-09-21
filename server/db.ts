/**
 * SQLite 数据层 — 使用 Node 22 内置 node:sqlite，零原生编译依赖。
 * 数据文件默认位于 <项目根>/data/ams.db，可用环境变量 DATA_DIR 覆盖（Docker 挂 volume 用）。
 */
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { resolvePaging, toListResult } from "./listQuery.ts";
import { instrumentDatabase } from "./sqliteUtil.ts";
import { asString, asNumber, asCount } from "./sqliteUtil.ts";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, "ams.db");

/**
 * 数据库连接做成可热重载：恢复备份时需要「关旧连接 → 替换文件 → 开新连接」，
 * 而 auditDb / authMiddleware 等模块在模块作用域缓存了 prepared statement，
 * 所以这里提供 onDbReload 钩子，重开连接后让它们把缓存语句重新 prepare 一遍。
 * 由于 ES module 的 import 是实时绑定，其它模块读到的 `db` 会自动指向新连接。
 */
export let db = new DatabaseSync(DB_PATH);

/**
 * 连接级 PRAGMA 配置（sqlite-best-practices）：
 * - busy_timeout=5000：写入冲突时等待而非直接 "database is locked"（连接级设置，每次开连接都要设）
 * - synchronous=NORMAL：WAL 模式下事务安全且减少磁盘同步（可选 FULL 换取更严格耐久性）
 * - cache_size=-20000：20MB 页缓存（负数=KB 单位），提升读性能
 * - temp_store=MEMORY：临时表/排序走内存，排序操作提速
 */
function applyConnectionPragmas(conn: DatabaseSync): void {
  conn.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -20000;
    PRAGMA temp_store = MEMORY;
  `);
}

applyConnectionPragmas(db);
// 慢查询监控：包装 prepare，超时阈值查询输出结构化日志（可观测性）
instrumentDatabase(db);

/** 重开连接后需要重新 prepare 缓存语句的钩子（由审计/安全等模块注册） */
const reloadHooks: Array<() => void> = [];
export function onDbReload(hook: () => void): void {
  reloadHooks.push(hook);
}

/**
 * 可重入事务助手：最外层 BEGIN/COMMIT（失败 ROLLBACK 并抛出）；
 * 嵌套调用不再开事务，直接并入外层（SQLite 不支持嵌套 BEGIN，
 * 而 node:sqlite 也不暴露 inTransaction 探测，故用进程内计数器——
 * 事件循环单线程且所有回调同步执行，计数不会失准）。
 */
let txDepth = 0;
export function transact<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  txDepth++;
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    txDepth--;
  }
}

/**
 * 运行 PRAGMA optimize（sqlite-best-practices）：
 * 按需更新查询规划器统计（sqlite_stat1），无变更时是快速 no-op。
 * 建议：应用退出前 / 周期性（如每小时）执行。
 */
export function optimizeDb(): void {
  try {
    db.exec("PRAGMA optimize;");
  } catch (e) {
    console.warn("[db] PRAGMA optimize 失败：", e);
  }
}

/** 关闭当前连接（不抛错）。恢复备份前调用。 */
export function closeDb(): void {
  try {
    db.close();
  } catch {
    /* 已关闭或关闭失败都忽略，避免阻断恢复流程 */
  }
}

/** 用 DB_PATH 重新打开连接并回放所有重载钩子。恢复备份后调用。 */
export function reloadDb(): void {
  closeDb();
  db = new DatabaseSync(DB_PATH);
  resetSchemaProbes();
  applyConnectionPragmas(db);
  for (const hook of reloadHooks) {
    try {
      hook();
    } catch (e) {
      console.error("[db] 数据库重载钩子执行失败：", e);
    }
  }
}

// 模块加载时初始化：开启 WAL + 确保 employees 表存在（首次启动播种依赖此表）
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS employees (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    idCard            TEXT DEFAULT '',
    gender            TEXT DEFAULT '男',
    age               INTEGER DEFAULT 0,
    phone             TEXT DEFAULT '',
    department        TEXT DEFAULT '',
    role              TEXT DEFAULT '',
    status            TEXT DEFAULT '在职',
    joinDate          TEXT DEFAULT '',
    yearsOfService    TEXT DEFAULT '0.0',
    employmentType    TEXT DEFAULT '全职',
    hasSocialSecurity INTEGER DEFAULT 1,
    contractYears     INTEGER DEFAULT 3,
    contractSignDate  TEXT DEFAULT '',
    contractExpiry    TEXT DEFAULT '',
    daysToExpiry      INTEGER DEFAULT 0,
    changeStatus      TEXT DEFAULT '无',
    registeredAddress TEXT DEFAULT '',
    currentAddress    TEXT DEFAULT '',
    isVeteran         INTEGER DEFAULT 0,
    formerUnit        TEXT DEFAULT '无',
    militaryDates     TEXT DEFAULT '无',
    remarks           TEXT DEFAULT '',
    systemRole        TEXT DEFAULT 'EMPLOYEE',
    departmentId      TEXT,
    createdAt         TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt         TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// ---------- 行 <-> 对象 转换（SQLite 无布尔类型，用 0/1） ----------

/** employees 表原始行（含 LEFT JOIN 来的部门名 deptName）。 */
export interface EmployeeRow {
  id: string;
  name: string;
  idCard: string;
  gender: string;
  age: number;
  phone: string;
  department: string;
  role: string;
  status: string;
  joinDate: string;
  yearsOfService: string;
  employmentType: string;
  hasSocialSecurity: number;
  contractYears: number;
  contractSignDate: string;
  contractExpiry: string;
  daysToExpiry: number;
  changeStatus: string;
  registeredAddress: string;
  currentAddress: string;
  isVeteran: number;
  formerUnit: string;
  militaryDates: string;
  remarks: string;
  systemRole: string;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
  deptName?: string;
  /** 绑定账号的系统角色（真实权限来源）；未绑定账号时为空 */
  accountRole?: string;
}

/** 对外暴露的员工对象：布尔列已归一化为 boolean。 */
export interface User {
  id: string;
  name: string;
  idCard: string;
  gender: string;
  age: number;
  phone: string;
  department: string;
  role: string;
  status: string;
  joinDate: string;
  yearsOfService: string;
  employmentType: string;
  hasSocialSecurity: boolean;
  contractYears: number;
  contractSignDate: string;
  contractExpiry: string;
  daysToExpiry: number;
  changeStatus: string;
  registeredAddress: string;
  currentAddress: string;
  isVeteran: boolean;
  formerUnit: string;
  militaryDates: string;
  remarks: string;
  systemRole: string;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function rowToUser(row: unknown): User | null {
  if (!row || typeof row !== "object") return null;
  const r = row as EmployeeRow;
  return {
    id: r.id,
    name: r.name,
    idCard: r.idCard,
    gender: r.gender,
    age: r.age,
    phone: r.phone,
    // departmentId 是部门关系的真值（外键）；部门名在读取时按 id 关联得出，
    // 这样删部门/改部门名都能自动同步，不会再出现「指向已不存在部门」的陈旧字符串。
    department: r.deptName ?? r.department ?? "",
    role: r.role,
    status: r.status,
    joinDate: r.joinDate,
    yearsOfService: r.yearsOfService,
    employmentType: r.employmentType,
    hasSocialSecurity: !!r.hasSocialSecurity,
    contractYears: r.contractYears,
    contractSignDate: r.contractSignDate,
    contractExpiry: r.contractExpiry,
    daysToExpiry: r.daysToExpiry,
    changeStatus: r.changeStatus,
    registeredAddress: r.registeredAddress,
    currentAddress: r.currentAddress,
    isVeteran: !!r.isVeteran,
    formerUnit: r.formerUnit,
    militaryDates: r.militaryDates,
    remarks: r.remarks,
    // 真实系统角色只存在于 accounts（employees.systemRole 是历史遗留列，不再读写）；
    // 空串表示该员工尚未绑定登录账号，由界面显示成「未开通账号」。
    systemRole: r.accountRole ?? "",
    departmentId: r.departmentId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** 从写入载荷里解析出 departmentId：优先用显式 id，否则按部门名反查 */
function resolveDepartmentId(input: Record<string, unknown>): string | null {
  if (input && input.departmentId) return String(input.departmentId);
  if (input && input.department && hasDepartmentsTable()) {
    const row = db.prepare("SELECT id FROM departments WHERE name = ?").get(input.department as string);
    return row ? (row as { id: string }).id : null;
  }
  return null;
}

/**
 * accounts / departments 分别由 authDb、departmentsDb 建表，db.ts 只联查
 * systemRole 与部门名。只加载本模块的进程（员工导入、提醒扫描、单测）里
 * 它们可能还没建，此时必须退化为少联查/读缓存列，而不是让整条员工查询抛
 * "no such table"。探测到一次存在就不再重复探测；换连接时由 reloadDb 归零。
 */
let accountsTableReady = false;
let departmentsTableReady = false;
function resetSchemaProbes(): void {
  accountsTableReady = false;
  departmentsTableReady = false;
}
function accountsJoin(): { join: string; select: string } {
  if (!accountsTableReady) {
    try {
      db.prepare("SELECT 1 FROM accounts LIMIT 0").get();
      accountsTableReady = true;
    } catch {
      return { join: "", select: "" };
    }
  }
  return { join: "LEFT JOIN accounts a ON a.employeeId = e.id", select: ", a.systemRole AS accountRole" };
}

/** 按 id 取部门名，用于回填 employees.department 缓存列 */
function deptNameById(deptId: string): string {
  return (db.prepare("SELECT name FROM departments WHERE id = ?").get(deptId) as { name: string } | undefined)?.name ?? "";
}

function hasDepartmentsTable(): boolean {
  if (departmentsTableReady) return true;
  try {
    db.prepare("SELECT 1 FROM departments LIMIT 0").get();
    departmentsTableReady = true;
  } catch {
    return false;
  }
  return true;
}

/**
 * 员工查询的公共片段：JOIN 与 SELECT 都按「外部表是否已建」拼装。
 * deptFilter 是部门名匹配的 SQL 表达式，供关键字搜索复用。
 */
function employeeQueryParts(): { base: string; select: string; deptFilter: string } {
  const { join, select } = accountsJoin();
  if (!hasDepartmentsTable()) {
    return { base: `FROM employees e ${join}`, select, deptFilter: "e.department" };
  }
  return {
    base: `FROM employees e LEFT JOIN departments d ON d.id = e.departmentId ${join}`,
    select: `, d.name AS deptName${select}`,
    deptFilter: "COALESCE(d.name, '')",
  };
}

const FIELDS = [
  "name", "idCard", "gender", "age", "phone", "department", "role", "status",
  "joinDate", "yearsOfService", "employmentType", "hasSocialSecurity",
  "contractYears", "contractSignDate", "contractExpiry", "daysToExpiry",
  "changeStatus", "registeredAddress", "currentAddress", "isVeteran",
  "formerUnit", "militaryDates", "remarks",
  // 刻意不含 systemRole：真实角色只存 accounts，员工表那列是遗留死列（写它不改变任何权限）
] as const;

function normalize(input: Record<string, unknown>) {
  const out: Record<string, string | number | null> = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    let v = input[f];
    if (typeof v === "boolean") v = v ? 1 : 0;
    out[f] = v as string | number | null;
  }
  return out;
}

// listEmployees 返回类型：未请求分页 = 员工数组；请求分页 = 分页信封
export type EmployeeListResult = ReturnType<typeof rowToUser>[] | import("./listQuery.ts").ListResult<ReturnType<typeof rowToUser>>;

// ---------- CRUD ----------
// 返回类型：运行时根据是否传入分页参数返回 完整数组 或
// 分页信封 { items, total, page, pageSize, totalPages }。调用方用 Array.isArray 区分。
export function listEmployees(query: Record<string, unknown> = {}): EmployeeListResult {
  const paging = resolvePaging(query);
  const keyword = typeof query.keyword === "string" ? query.keyword.trim() : "";
  const { base, select, deptFilter } = employeeQueryParts();
  const where = keyword
    ? `WHERE e.name LIKE ? OR e.phone LIKE ? OR ${deptFilter} LIKE ?`
    : "";
  const params = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : [];

  const total = asCount(db.prepare(`SELECT COUNT(*) AS c ${base} ${where}`).get(...params)?.c);

  if (!paging.requested) {
    // 向后兼容：未请求分页时返回完整数组
    const rows = db
      .prepare(`SELECT e.*${select} ${base} ${where} ORDER BY e.id`)
      .all(...params);
    return rows.map((r) => rowToUser(r)).filter((u): u is NonNullable<typeof u> => u !== null);
  }

  const rows = db
    .prepare(
      `SELECT e.*${select} ${base} ${where} ORDER BY e.id LIMIT ? OFFSET ?`
    )
    .all(...params, paging.limit, paging.offset);
  return toListResult(rows.map((r) => rowToUser(r)).filter((u): u is NonNullable<typeof u> => u !== null), total, paging);
}

export function getEmployee(id: string) {
  const { base, select } = employeeQueryParts();
  const row = db.prepare(`SELECT e.*${select} ${base} WHERE e.id = ?`).get(id);
  return rowToUser(row);
}

/**
 * 单调递增工号序列（修复：删除员工后 ID 复用导致的历史引用混淆——
 * 如删掉 EMP0050 后新建员工再次拿到 EMP0050，会继承旧 ID 的孤儿数据引用）。
 * 序列持久化在 id_sequences 表，只增不减。
 */
function ensureIdSequences(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS id_sequences (
      name TEXT PRIMARY KEY,
      next INTEGER NOT NULL
    )
  `);
}
ensureIdSequences();

function nextEmployeeId(): string {
  const row = db.prepare("SELECT next FROM id_sequences WHERE name = 'employee'").get();
  let num: number;
  if (row) {
    num = asNumber(row.next);
  } else {
    // 首次初始化：现有最大工号 + 1（空库则从 1 开始）
    const maxRow = db
      .prepare("SELECT id FROM employees WHERE id LIKE 'EMP%' ORDER BY id DESC LIMIT 1")
      .get();
    num = maxRow ? parseInt(asString(maxRow.id).replace("EMP", ""), 10) + 1 : 1;
  }
  db.prepare(
    `INSERT INTO id_sequences (name, next) VALUES ('employee', ?)
     ON CONFLICT(name) DO UPDATE SET next = excluded.next`
  ).run(num + 1);
  return `EMP${String(num).padStart(4, "0")}`;
}

export function createEmployee(input: Record<string, unknown>) {
  const data = normalize(input);
  const id = nextEmployeeId();

  const keys = Object.keys(data);
  const sql = `INSERT INTO employees (id${keys.map(k => `, ${k}`).join("")})
               VALUES (?${keys.map(() => ", ?").join("")})`;

  // 插入 + 部门外键维护包在事务里，避免「员工建了但 departmentId 没挂上」的半截状态
  db.exec("BEGIN");
  try {
    db.prepare(sql).run(id, ...keys.map(k => data[k]));

    // 维护部门外键：按名称或显式 id 解析出 departmentId，并同步缓存部门名
    // （没有部门表时跳过维护，保留调用方写进来的部门名文本）
    const deptId = hasDepartmentsTable() ? resolveDepartmentId(input) : null;
    if (deptId) {
      db.prepare("UPDATE employees SET departmentId = ?, department = ? WHERE id = ?").run(deptId, deptNameById(deptId), id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return getEmployee(id);
}

/**
 * 员工姓名在各子表里都是展示用快照（历史留痕时抄下的），改名后必须一起跟着走，
 * 否则会出现「档案已改名，月报/异常列表还是旧名」，而按新名在打卡记录里搜索还会搜不到
 * （listRecords 的 employeeName LIKE 用的就是这份快照）。
 * 表若无外键约束（renewals / business_forms / overtime_ledger），列名也各不相同，逐条列明。
 */
export function syncEmployeeNameSnapshots(employeeId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const updates: string[] = [
    `UPDATE schedules SET employeeName = ? WHERE employeeId = ?`,
    `UPDATE punch_records SET employeeName = ? WHERE employeeId = ?`,
    `UPDATE anomalies SET employeeName = ? WHERE employeeId = ?`,
    `UPDATE overtime_ledger SET employeeName = ? WHERE employeeId = ?`,
    `UPDATE contract_renewals SET employeeName = ? WHERE employeeId = ?`,
    `UPDATE business_forms SET employeeName = ? WHERE employeeId = ?`,
  ];
  for (const sql of updates) {
    try {
      db.prepare(sql).run(trimmed, employeeId);
    } catch {
      /* 该表尚未创建（模块加载早期 / 精简库）时跳过，不影响主写入 */
    }
  }
}

export function updateEmployee(id: string, input: Record<string, unknown>) {
  const data = normalize(input);
  const keys = Object.keys(data);

  db.exec("BEGIN");
  try {
    if (keys.length > 0) {
      const sql = `UPDATE employees SET ${keys.map(k => `${k} = ?`).join(", ")},
                   updatedAt = datetime('now', 'localtime') WHERE id = ?`;
      db.prepare(sql).run(...keys.map(k => data[k]), id);
    }

    // 部门变更：显式 id 或部门名变动时，重新解析并维护 departmentId / 部门名
    if ((input.departmentId !== undefined || input.department !== undefined) && hasDepartmentsTable()) {
      const deptId = resolveDepartmentId(input);
      if (deptId) {
        db.prepare("UPDATE employees SET departmentId = ?, department = ? WHERE id = ?").run(deptId, deptNameById(deptId), id);
      } else {
        db.prepare("UPDATE employees SET departmentId = NULL, department = '' WHERE id = ?").run(id);
      }
    }

    // 改名与姓名快照同步放在同一事务里，避免"档案改了、子表没改"的半截状态
    if (typeof data.name === "string" && data.name.trim()) {
      syncEmployeeNameSnapshots(id, data.name);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return getEmployee(id);
}

export function deleteEmployee(id: string) {
  db.exec("BEGIN");
  try {
    // 登录账号必须一起解绑：否则员工删了账号还在，且带着一个指向空气的 employeeId，
    // 转正/加班/补卡的领域动作会落在一个已不存在的档案上
    try {
      db.prepare("UPDATE accounts SET employeeId = NULL WHERE employeeId = ?").run(id);
    } catch {
      /* accounts 由 authDb 建表，模块加载早期可能还不存在 */
    }
    // 续签历史无外键约束，需显式清理（避免孤儿记录被后续同 ID 引用）
    try {
      db.prepare("DELETE FROM contract_renewals WHERE employeeId = ?").run(id);
    } catch {
      /* 续签表尚未创建时忽略（模块加载早期） */
    }
    try {
      db.prepare("DELETE FROM business_forms WHERE employeeId = ?").run(id);
    } catch {
      /* 同上：业务单归档表 */
    }
    try {
      // 加班/调休台账以 employeeId 为主键且无外键，不清会留下一个「已不存在的人的余额」
      db.prepare("DELETE FROM overtime_ledger WHERE employeeId = ?").run(id);
    } catch {
      /* 同上：审批表尚未创建时忽略 */
    }
    try {
      // 指向该员工的提醒待办（合同到期 / 试用期转正）：人已不在，催它没有意义
      db.prepare("DELETE FROM todos WHERE targetId = ?").run(id);
    } catch {
      /* todos 表由 todosDb 建，模块加载早期可能还不存在 */
    }
    try {
      // 归并键指向该员工的周期提醒通知（remindersDb 用 contract:{id} / probation:{id}）
      db.prepare("DELETE FROM notifications WHERE refKey IN (?, ?)").run(
        `contract:${id}`,
        `probation:${id}`
      );
    } catch {
      /* 同上：notifications 表由 notificationsDb 建 */
    }
    const result = db.prepare("DELETE FROM employees WHERE id = ?").run(id);
    db.exec("COMMIT");
    return result.changes > 0;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------- 首次启动播种（与原 mock 逻辑一致的随机数据） ----------
function generateIdCard(): string {
  const year = 1970 + Math.floor(Math.random() * 30);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `440106${year}${month}${day}${Math.floor(Math.random() * 9000) + 1000}`;
}

function seedIfEmpty() {
  const count = asCount(db.prepare("SELECT COUNT(*) AS c FROM employees").get()?.c);
  if (count > 0) return;

  const insert = db.prepare(`INSERT INTO employees (
    id, name, idCard, gender, age, phone, department, role, status, joinDate,
    yearsOfService, employmentType, hasSocialSecurity, contractYears,
    contractSignDate, contractExpiry, daysToExpiry, changeStatus,
    registeredAddress, currentAddress, isVeteran, formerUnit, militaryDates,
    remarks, systemRole
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const departments = ["研发部", "产品部", "设计部", "市场部", "人力资源中心"];
  const roles = ["前端工程师", "后端工程师", "产品经理", "UI设计师", "HR"];
  const systemRoles = ["ADMIN", "HR", "EMPLOYEE"];

  for (let i = 0; i < 45; i++) {
    const idCard = generateIdCard();
    const birthYear = parseInt(idCard.substring(6, 10));
    const age = new Date().getFullYear() - birthYear;
    const gender = parseInt(idCard.charAt(16)) % 2 === 0 ? "女" : "男";
    const joinDate = new Date(Date.now() - Math.random() * 100000000000).toISOString().split("T")[0];
    const yearsOfService = ((Date.now() - new Date(joinDate).getTime()) / 31536000000).toFixed(1);
    const contractSignDate = new Date(Date.now() - Math.random() * 31536000000).toISOString().split("T")[0];
    const contractYears = [1, 3, 5][Math.floor(Math.random() * 3)];
    const expiry = new Date(contractSignDate);
    expiry.setFullYear(expiry.getFullYear() + contractYears);
    const contractExpiry = expiry.toISOString().split("T")[0];
    const daysToExpiry = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
    const isVeteran = Math.random() > 0.9;

    insert.run(
      `EMP${String(i + 1).padStart(4, "0")}`,
      `员工 ${i + 1}`,
      idCard, gender, age,
      `13${Math.floor(Math.random() * 900000000) + 100000000}`,
      departments[Math.floor(Math.random() * 5)],
      roles[Math.floor(Math.random() * 5)],
      Math.random() > 0.2 ? "在职" : "试用期",
      joinDate, yearsOfService,
      ["全职", "兼职", "实习", "外包"][Math.floor(Math.random() * 4)],
      Math.random() > 0.1 ? 1 : 0,
      contractYears, contractSignDate, contractExpiry, daysToExpiry,
      ["无", "晋升", "调岗", "降职"][Math.floor(Math.random() * 4)],
      "广东省广州市天河区XX路XX号",
      "广东省广州市海珠区XX路XX号",
      isVeteran ? 1 : 0,
      isVeteran ? "某某部队" : "无",
      isVeteran ? "2015-09 至 2017-09" : "无",
      "无",
      systemRoles[Math.floor(Math.random() * 3)]
    );
  }
  console.log("[db] Seeded 45 employees into SQLite");
}

seedIfEmpty();
