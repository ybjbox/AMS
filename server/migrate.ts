/**
 * 数据库迁移 — 引入外键约束，消灭「删除员工/部门后产生悬空数据」问题（P1-2）。
 *
 * 为什么需要迁移而不是直接 ALTER：SQLite 不支持 ALTER TABLE ADD FOREIGN KEY，
 * 只能重建表。所以这里把需要外键的表整体重建为带 FK 定义的新表，拷贝数据后改名。
 *
 * 关键设计：
 * 1. 员工相关表（schedules / punch_records / anomalies）对 employees 设 ON DELETE CASCADE，
 *    删员工时考勤数据自动级联清除，不再残留「幽灵员工」。
 * 2. employees 新增 departmentId 列，外键指向 departments(id) ON DELETE SET NULL，
 *    并把旧数据里用「部门名字符串」存的引用回填成 departmentId。
 * 3. departments.parentId 自引用 CASCADE；roles.departmentId → departments CASCADE（v6 起，
 *    此前 SET NULL 与列的 NOT NULL 自相矛盾，删除持有职位的部门必然报错）。
 * 4. folders.parentId 自引用 CASCADE；documents.folderId → folders CASCADE。
 *
 * 整个重建包在事务里，保证原子性；user_version 防止重复执行。
 *
 * v2（P1-3）：为 schedules / punch_records 增加 version 列（乐观锁基础），
 * 支持增量 upsert / 删除，避免「整表替换」在多人协作时互相覆盖。
 * v3（P1-6）：新增 settings 表（key-value，存主题等重启不丢的小配置）。
 * v4（P2-5）：为高频查询列补索引（documents.folderId / punch_records.employeeId / punch_records.date），
 *     消除全表扫描。schedules 当前按 employeeId 主键、无 date 列，故不建（审计旧条目已失效）。
 * v5（P2-7）：新增 todos / notifications 两张表，把待办与通知从纯前端接入后端，
 *     支持跨设备同步与「张三给李四派单」式协作。
 * v6：修复 roles 外键自相矛盾（NOT NULL 列 + ON DELETE SET NULL）→ 改 CASCADE，
 *     否则「删除仍被职位引用的部门」会让部门树整树替换事务失败（500）。
 * v7（第二梯队 #11）：清洗 audit_logs 存量里的 apiKey 明文——SECRET_KEYS 此前缺
 *     apikey/api_key，/api/ai/config 的 PATCH 审计把 LLM 密钥原文写进了 afterJson。
 *
 * 健壮性（修复「全新部署启动崩溃」latent bug）：
 *   `current < 1` 分支要先把全部带 FK 的表建好。但有两个不同前提：
 *   - 旧库（迁移前已建过全部表、但 user_version=0）：源表存在 → 走 rename 重建 + 拷数据。
 *   - 全新库（db.ts 仅引导了 employees，其余表尚不存在）：源表不存在 → 直接 CREATE，
 *     否则 `SELECT FROM 不存在的表` 会让迁移在启动时直接崩溃。
 *   每个 rebuild* 都先判断源表是否存在，从而两种前提都能正确升级。
 */
import { db } from "./db.ts";
import { ensureTodosTable } from "./todosDb.ts";
import { ensureNotificationsTable } from "./notificationsDb.ts";
import { ensureImportJobsTable } from "./importJobsDb.ts";

/** 当前 schema 版本。导出供回归脚本断言（不要再硬编码数字）。 */
export const SCHEMA_VERSION = 8;

/** 判断某张表当前是否已存在（用于区分「全新库」与「旧库已有表」两种迁移前提）。 */
function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return !!row;
}

export function runMigrations(): void {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (current >= SCHEMA_VERSION) return;

  // 结构变更期间先关外键，避免拷贝历史数据时因旧孤儿数据报错；最后再统一开启。
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    if (current < 1) {
      // 全新库 / 旧库：一次性确保全部带 FK 的表就位。
      // 顺序必须保证引用方晚于被引用方：departments/roles 先于 employees，
      // employees 先于 schedules/punch_records/anomalies（它们外键指向 employees），
      // folders 先于 documents。
      rebuildDepartments();
      rebuildRoles();
      rebuildEmployees();
      rebuildSchedules();
      rebuildPunchRecords();
      rebuildAnomalies();
      rebuildFolders();
      rebuildDocuments();
    }
    // v1 -> v2：给考勤两张表加 version 列（幂等，列已存在则跳过）
    addVersionColumns();
    // v3：确保 settings 表存在（幂等，key-value 持久化，存主题等重启不丢的小配置）
    ensureSettingsTable();
    // v4：为高频查询列补索引（幂等，CREATE INDEX IF NOT EXISTS，全新库/旧库升级都会执行）
    ensureIndexes();
    // v5：todos / notifications 两张表（幂等，CREATE TABLE IF NOT EXISTS，作为后续版本的常驻步骤）
    ensureTodosAndNotificationsTables();
    // v6：重建 roles——departmentId 为 NOT NULL 却声明 ON DELETE SET NULL 自相矛盾
    //（删除持有职位的部门必然触发约束冲突），改为 CASCADE：部门移除时其职位一并清除
    if (current < 6) rebuildRoles();
    // v7：清洗 audit_logs 存量中的 apiKey 明文（与 auditDb.SECRET_KEYS 补齐配对）
    if (current < 7) cleanseAuditSecrets();
    // v8：导入任务表（#16 Excel 提交异步化，进度轮询用）
    if (current < 8) ensureImportJobsTable();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    // 恢复外键状态后把错误抛出去，让启动失败而不是带着半套表结构运行
    db.exec("PRAGMA foreign_keys = ON");
    throw e;
  }

  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  console.log("[migrate] 已升级数据库模式到 v%s（启用外键约束 + 考勤乐观锁）", SCHEMA_VERSION);
}

/** 给 schedules / punch_records 增加 version 列（若已存在则跳过）。幂等，可重复执行。 */
function addVersionColumns(): void {
  for (const table of ["schedules", "punch_records"]) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "version")) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN version INTEGER DEFAULT 0`).run();
    }
  }
}

/** 确保 settings 表存在（key-value 持久化）。幂等，可重复执行。 */
function ensureSettingsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key       TEXT PRIMARY KEY,
      value     TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

/** P2-5：高频查询列索引定义。名清单导出供回归脚本断言。 */
export const EXPECTED_INDEXES: Array<{ name: string; table: string; columns: string }> = [
  { name: "idx_documents_folderId", table: "documents", columns: "folderId" },
  { name: "idx_punch_records_employeeId", table: "punch_records", columns: "employeeId" },
  { name: "idx_punch_records_date", table: "punch_records", columns: "date" },
];

/**
 * 为高频查询列补索引（P2-5）。消除 documents.folderId / punch_records.employeeId / punch_records.date
 * 的全表扫描。使用 CREATE INDEX IF NOT EXISTS，重复执行安全；
 * 在事务内执行（当前 SCHEMA_VERSION=4，并作为后续版本迁移的常驻步骤）。
 *
 * 注意：schedules 当前按 employeeId 主键、无 date 列，审计旧条目「schedules.date」已失效，故不建索引。
 */
function ensureIndexes(): void {
  for (const idx of EXPECTED_INDEXES) {
    db.exec(
      `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns})`
    );
  }
}

/** v5（P2-7）：确保 todos / notifications 表及其索引存在。幂等，作为常驻步骤。 */
function ensureTodosAndNotificationsTables(): void {
  ensureTodosTable();
  ensureNotificationsTable();
}

/**
 * v7：清洗 audit_logs 存量里泄露的密钥明文。
 *
 * SECRET_KEYS 此前不含 apikey/api_key，PATCH /api/ai/config 的请求体摘要
 * （compactBody 对 <200 字符串原样保留）经 toJson 后仍是明文 JSON。
 * 这里把 beforeJson/afterJson 中密钥键的值统一替换为占位符。幂等。
 * 导出供回归测试直接对种子数据断言。
 */
const SECRET_JSON_KEY = /("(?:apiKey|api_key|clientSecret|client_secret)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;

export function cleanseAuditSecrets(): void {
  if (!tableExists("audit_logs")) return;
  const rows = db
    .prepare(
      `SELECT id, beforeJson, afterJson FROM audit_logs
       WHERE instr(lower(coalesce(beforeJson, '')), 'apikey') > 0
          OR instr(lower(coalesce(beforeJson, '')), 'api_key') > 0
          OR instr(lower(coalesce(beforeJson, '')), 'clientsecret') > 0
          OR instr(lower(coalesce(afterJson, '')), 'apikey') > 0
          OR instr(lower(coalesce(afterJson, '')), 'api_key') > 0
          OR instr(lower(coalesce(afterJson, '')), 'clientsecret') > 0`
    )
    .all() as Array<{ id: number; beforeJson: string | null; afterJson: string | null }>;
  const update = db.prepare("UPDATE audit_logs SET beforeJson = ?, afterJson = ? WHERE id = ?");
  for (const row of rows) {
    const before = row.beforeJson?.replace(SECRET_JSON_KEY, '$1"[已脱敏]"') ?? row.beforeJson;
    const after = row.afterJson?.replace(SECRET_JSON_KEY, '$1"[已脱敏]"') ?? row.afterJson;
    if (before !== row.beforeJson || after !== row.afterJson) {
      update.run(before, after, row.id);
    }
  }
  if (rows.length > 0) console.log("[migrate] v7 已清洗 %d 条审计日志中的密钥明文", rows.length);
}

// ---------- 各表 Schema 常量（rebuild 直接建表与 rename 重建共用，避免两份定义漂移） ----------
const DEPARTMENTS_SCHEMA = `
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  parentId TEXT,
  FOREIGN KEY (parentId) REFERENCES departments(id) ON DELETE CASCADE
`;

const ROLES_SCHEMA = `
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  departmentId TEXT NOT NULL,
  priority     INTEGER DEFAULT 0,
  FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE CASCADE
`;

const EMPLOYEES_SCHEMA = `
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
  updatedAt         TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE SET NULL
`;

const SCHEDULES_SCHEMA = `
  employeeId   TEXT PRIMARY KEY,
  employeeName TEXT NOT NULL,
  shiftIds     TEXT DEFAULT '[]',
  FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
`;

const PUNCH_RECORDS_SCHEMA = `
  id           TEXT PRIMARY KEY,
  employeeId   TEXT NOT NULL,
  employeeName TEXT NOT NULL,
  date         TEXT NOT NULL,
  time         TEXT NOT NULL,
  FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
`;

const ANOMALIES_SCHEMA = `
  id           TEXT PRIMARY KEY,
  employeeId   TEXT NOT NULL,
  employeeName TEXT NOT NULL,
  date         TEXT NOT NULL,
  type         TEXT NOT NULL,
  minutes      INTEGER,
  description  TEXT DEFAULT '',
  FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
`;

const FOLDERS_SCHEMA = `
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  parentId TEXT,
  FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE
`;

const DOCUMENTS_SCHEMA = `
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT DEFAULT '',
  url        TEXT DEFAULT '',
  size       INTEGER DEFAULT 0,
  uploadedAt TEXT DEFAULT '',
  folderId   TEXT,
  storedPath TEXT DEFAULT '',
  FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE CASCADE
`;

/**
 * 重建带 FK 的表：源表存在 → rename 重建（旧库迁移，保留数据）；
 * 源表不存在 → 直接创建（全新库，无需拷贝）。两种前提都能正确升级。
 * 事务内执行；DROP TABLE IF EXISTS <name>_new 保证上一次崩溃残留的 _new 表不会让重建失败。
 */
function rebuildDepartments(): void {
  if (!tableExists("departments")) {
    db.exec(`CREATE TABLE departments (${DEPARTMENTS_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS departments_new");
  db.exec(`CREATE TABLE departments_new (${DEPARTMENTS_SCHEMA})`);
  db.exec(`INSERT INTO departments_new (id, name, priority, parentId)
           SELECT id, name, priority, parentId FROM departments;`);
  db.exec("DROP TABLE departments");
  db.exec("ALTER TABLE departments_new RENAME TO departments");
}

function rebuildRoles(): void {
  if (!tableExists("roles")) {
    db.exec(`CREATE TABLE roles (${ROLES_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS roles_new");
  db.exec(`CREATE TABLE roles_new (${ROLES_SCHEMA})`);
  db.exec(`INSERT INTO roles_new (id, name, departmentId, priority)
           SELECT id, name, departmentId, priority FROM roles;`);
  db.exec("DROP TABLE roles");
  db.exec("ALTER TABLE roles_new RENAME TO roles");
}

function rebuildEmployees(): void {
  if (!tableExists("employees")) {
    db.exec(`CREATE TABLE employees (${EMPLOYEES_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS employees_new");
  db.exec(`CREATE TABLE employees_new (${EMPLOYEES_SCHEMA})`);
  db.exec(`
    INSERT INTO employees_new (
      id, name, idCard, gender, age, phone, department, role, status, joinDate,
      yearsOfService, employmentType, hasSocialSecurity, contractYears,
      contractSignDate, contractExpiry, daysToExpiry, changeStatus,
      registeredAddress, currentAddress, isVeteran, formerUnit, militaryDates,
      remarks, systemRole, createdAt, updatedAt
    )
    SELECT
      id, name, idCard, gender, age, phone, department, role, status, joinDate,
      yearsOfService, employmentType, hasSocialSecurity, contractYears,
      contractSignDate, contractExpiry, daysToExpiry, changeStatus,
      registeredAddress, currentAddress, isVeteran, formerUnit, militaryDates,
      remarks, systemRole, createdAt, updatedAt
    FROM employees;
  `);
  // 把「部门名字符串」回填成 departmentId；匹配不上的（部门已被删）保持 NULL。
  db.exec(`
    UPDATE employees_new
       SET departmentId = (SELECT d.id FROM departments d WHERE d.name = employees_new.department)
     WHERE department IS NOT NULL AND department != '';
  `);
  db.exec("DROP TABLE employees");
  db.exec("ALTER TABLE employees_new RENAME TO employees");
}

function rebuildSchedules(): void {
  if (!tableExists("schedules")) {
    db.exec(`CREATE TABLE schedules (${SCHEDULES_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS schedules_new");
  db.exec(`CREATE TABLE schedules_new (${SCHEDULES_SCHEMA})`);
  db.exec(`INSERT INTO schedules_new (employeeId, employeeName, shiftIds)
           SELECT employeeId, employeeName, shiftIds FROM schedules;`);
  db.exec("DROP TABLE schedules");
  db.exec("ALTER TABLE schedules_new RENAME TO schedules");
}

function rebuildPunchRecords(): void {
  if (!tableExists("punch_records")) {
    db.exec(`CREATE TABLE punch_records (${PUNCH_RECORDS_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS punch_records_new");
  db.exec(`CREATE TABLE punch_records_new (${PUNCH_RECORDS_SCHEMA})`);
  db.exec(`INSERT INTO punch_records_new (id, employeeId, employeeName, date, time)
           SELECT id, employeeId, employeeName, date, time FROM punch_records;`);
  db.exec("DROP TABLE punch_records");
  db.exec("ALTER TABLE punch_records_new RENAME TO punch_records");
}

function rebuildAnomalies(): void {
  if (!tableExists("anomalies")) {
    db.exec(`CREATE TABLE anomalies (${ANOMALIES_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS anomalies_new");
  db.exec(`CREATE TABLE anomalies_new (${ANOMALIES_SCHEMA})`);
  db.exec(`INSERT INTO anomalies_new (id, employeeId, employeeName, date, type, minutes, description)
           SELECT id, employeeId, employeeName, date, type, minutes, description FROM anomalies;`);
  db.exec("DROP TABLE anomalies");
  db.exec("ALTER TABLE anomalies_new RENAME TO anomalies");
}

function rebuildFolders(): void {
  if (!tableExists("folders")) {
    db.exec(`CREATE TABLE folders (${FOLDERS_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS folders_new");
  db.exec(`CREATE TABLE folders_new (${FOLDERS_SCHEMA})`);
  db.exec(`INSERT INTO folders_new (id, name, parentId)
           SELECT id, name, parentId FROM folders;`);
  db.exec("DROP TABLE folders");
  db.exec("ALTER TABLE folders_new RENAME TO folders");
}

function rebuildDocuments(): void {
  if (!tableExists("documents")) {
    db.exec(`CREATE TABLE documents (${DOCUMENTS_SCHEMA})`);
    return;
  }
  db.exec("DROP TABLE IF EXISTS documents_new");
  db.exec(`CREATE TABLE documents_new (${DOCUMENTS_SCHEMA})`);
  db.exec(`INSERT INTO documents_new (id, name, type, url, size, uploadedAt, folderId, storedPath)
           SELECT id, name, type, url, size, uploadedAt, folderId, storedPath FROM documents;`);
  db.exec("DROP TABLE documents");
  db.exec("ALTER TABLE documents_new RENAME TO documents");
}
