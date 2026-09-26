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
import { db, EMPLOYEE_COLUMNS } from "./db.ts";
import { ensureTodosTable } from "./todosDb.ts";
import { ensureNotificationsTable } from "./notificationsDb.ts";
import { ensureImportJobsTable } from "./importJobsDb.ts";
import { ensureOrgTables } from "./departmentsDb.ts";
import { ensurePunchSourceColumns } from "./attendanceDb.ts";
import { DEPT_SHIFT_RULE_COLUMNS, ensureShiftRulesTable } from "./shiftRulesDb.ts";

/** 当前 schema 版本。导出供回归脚本断言（不要再硬编码数字）。 */
export const SCHEMA_VERSION = 14;

/** 判断某张表当前是否已存在（用于区分「全新库」与「旧库已有表」两种迁移前提）。 */
function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return !!row;
}

export function runMigrations(): void {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

  // 幂等维护：索引、唯一约束、姓名/部门快照自愈。每次都跑，不再只在版本变化时跑
  // （此前它们在下面的升级事务里，于是 `current >= SCHEMA_VERSION` 的提前返回会把它们
  // 一起跳过 —— 「常驻」二字名不副实，考勤导入依赖的 ON CONFLICT 索引也依赖它）。
  const runResidentMaintenance = () => {
    ensureIndexes();
    ensureTodosAndNotificationsTables();
    ensurePunchRecordUniqueIndex();
    // 老备份恢复回来可能缺 source 列（企微同步才引入），常驻补列比抬版本更稳：
    // 恢复路径不经过版本号变化，靠版本步骤会漏
    ensurePunchSourceColumns();
    // v14 的四项收口同样常驻。它们**每一项都按库里的实际形状判定**（列在不在、DDL 里有没有
    // localtime / FOREIGN KEY、值是不是 Z 结尾），所以重复执行是安全的，而且能治这一种情况：
    // user_version 已经被某次启动抬到 14、但当时步骤还没写全 —— 真发生过，靠版本号兜不住。
    alignDataConsistency();
    syncDisplaySnapshots();
  };

  if (current >= SCHEMA_VERSION) {
    runResidentMaintenance();
    return;
  }

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
    // v6：重建 roles——departmentId 为 NOT NULL 却声明 ON DELETE SET NULL 自相矛盾
    //（删除持有职位的部门必然触发约束冲突），改为 CASCADE：部门移除时其职位一并清除
    if (current < 6) rebuildRoles();
    // v7：清洗 audit_logs 存量中的 apiKey 明文（与 auditDb.SECRET_KEYS 补齐配对）
    if (current < 7) cleanseAuditSecrets();
    // v8：导入任务表（#16 Excel 提交异步化，进度轮询用）
    if (current < 8) ensureImportJobsTable();
    // v9：通知归并键 refKey + 清洗周期提醒的历史重复未读
    if (current < 9) migrateNotificationRefKeys();
    // v10：员工↔账号唯一绑定（清洗 + 部分唯一索引，本身幂等）
    if (current < 10) ensureUniqueAccountEmployeeBinding();
    // v13：清掉指向已删除员工的待办与周期提醒通知（新删除路径已在 deleteEmployee 里同步清）
    if (current < 13) pruneOrphanReminderRefs();
    // v14：时间戳口径统一成本地时间、剩余天数不再存列、班次规则补部门外键 —— 放在常驻维护里
    //      而不是 `current < 14`，理由见 runResidentMaintenance 的注释。
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    // 恢复外键状态后把错误抛出去，让启动失败而不是带着半套表结构运行
    db.exec("PRAGMA foreign_keys = ON");
    throw e;
  }

  db.exec("PRAGMA foreign_keys = ON");
  // v4 索引 / v5 todos+notifications 表 / v11 打卡唯一索引 / v12 快照对齐都在常驻维护里
  runResidentMaintenance();
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

/** v5（P2-7）：确保 todos / notifications / departments+roles 表及索引存在。幂等，作为常驻步骤。 */
function ensureTodosAndNotificationsTables(): void {
  ensureTodosTable();
  ensureNotificationsTable();
  // 常驻维护里的 syncDisplaySnapshots 要读 departments：恢复来的旧备份缺这张表时，
  // 不能让整个进程启动崩在 "no such table: departments"
  ensureOrgTables();
}

/**
 * v9：给通知加归并键 refKey，并清洗周期提醒的历史重复未读。
 *
 * 合同到期/转正提醒的文案带「剩余 N 天」，旧的「标题 + 全文」去重每天失配一次，
 * 未读数按天累积（2 个员工 × 3 天 = 6 条）。这里从存量文案还原归并键
 * （`员工 34 (EMP0034) 的合同将于…` → `contract:EMP0034`），
 * 同一 (recipient, refKey) 的未读只保留最新一条。
 * 标题 → 前缀映射与 src/hooks/useEmployeeReminders.ts 保持一致。导出供回归测试直接断言。
 */
const REF_KEY_TITLE_PREFIX: Record<string, string> = {
  合同到期提醒: "contract",
  试用期转正提醒: "probation",
};

export function migrateNotificationRefKeys(): void {
  if (!tableExists("notifications")) return;

  const cols = db.prepare(`PRAGMA table_info(notifications)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "refKey")) {
    db.prepare(`ALTER TABLE notifications ADD COLUMN refKey TEXT DEFAULT ''`).run();
  }

  const pending = db
    .prepare(`SELECT id, title, message FROM notifications WHERE coalesce(refKey, '') = ''`)
    .all() as Array<{ id: string; title: string; message: string }>;
  const setRefKey = db.prepare(`UPDATE notifications SET refKey = ? WHERE id = ?`);
  for (const row of pending) {
    const prefix = REF_KEY_TITLE_PREFIX[row.title];
    if (!prefix) continue;
    const target = /\(([^()]+)\)/.exec(row.message)?.[1]?.trim();
    if (target) setRefKey.run(`${prefix}:${target}`, row.id);
  }

  const duplicates = db
    .prepare(
      `SELECT id FROM notifications n
       WHERE n.read = 0 AND n.refKey <> ''
         AND EXISTS (
           SELECT 1 FROM notifications m
           WHERE m.recipient = n.recipient AND m.refKey = n.refKey AND m.read = 0
             AND (m.createdAt > n.createdAt OR (m.createdAt = n.createdAt AND m.id > n.id))
         )`
    )
    .all() as Array<{ id: string }>;
  const del = db.prepare(`DELETE FROM notifications WHERE id = ?`);
  for (const row of duplicates) del.run(row.id);
  if (duplicates.length) {
    console.log("[migrate] v9 已归并 %d 条重复的未读提醒通知", duplicates.length);
  }
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

/**
 * employees 的最终定义 = db.ts 里那份唯一列定义 + 外键。
 * 列定义绝不在这里重抄一遍：曾经这里和 db.ts 各存一份 27 列，改一处漏一处就是
 * 「新库有这列、老库没有」或反过来（rebuild 的 INSERT 列表一漏就是静默丢数据）。
 */
const EMPLOYEES_SCHEMA = `
  ${EMPLOYEE_COLUMNS},
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
  source       TEXT NOT NULL DEFAULT '',
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

/** 班次规则的部门外键（列定义仍归 shiftRulesDb 所有，这里只补 FK，理由见 EMPLOYEES_SCHEMA）。 */
const DEPT_SHIFT_RULES_SCHEMA = `
  ${DEPT_SHIFT_RULE_COLUMNS},
  FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE CASCADE
`;

/**
 * 重建带 FK 的表：源表存在 → rename 重建（旧库迁移，保留数据）；
 * 源表不存在 → 直接创建（全新库，无需拷贝）。两种前提都能正确升级。
 * 事务内执行；DROP TABLE IF EXISTS <name>_new 保证上一次崩溃残留的 _new 表不会让重建失败。
 */
/** 某张表当前的列名（顺序即建表顺序）。 */
function columnsOf(table: string): string[] {
  return (db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as Array<{ name: string }>).map(
    (c) => c.name
  );
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * 通用「重建以补外键」：源表存在 → rename 重建（旧库迁移，保留数据）；
 * 源表不存在 → 直接创建（全新库，无需拷贝）。两种前提都能正确升级。
 *
 * 拷贝哪些列由**新旧两边的列名交集**决定，不再手维护 INSERT 列表：
 * 手维护的那份一旦和列定义脱节，就是「迁移时静默丢一列数据」——
 * 表名与列名都来自本模块的字面量与该库自己的 pragma，不存在外部输入。
 */
function rebuildTable(name: string, schema: string): void {
  if (!tableExists(name)) {
    db.exec(`CREATE TABLE ${name} (${schema})`);
    return;
  }
  db.exec(`DROP TABLE IF EXISTS ${name}_new`);
  db.exec(`CREATE TABLE ${name}_new (${schema})`);
  const target = new Set(columnsOf(`${name}_new`));
  const shared = columnsOf(name).filter((c) => target.has(c));
  const list = shared.map(quoteIdent).join(", ");
  db.exec(`INSERT INTO ${name}_new (${list}) SELECT ${list} FROM ${name};`);
  db.exec(`DROP TABLE ${name}`);
  db.exec(`ALTER TABLE ${name}_new RENAME TO ${name}`);
}

/**
 * 把「部门名字符串」回填成 departmentId。
 * 只补 NULL：老库里已经指对的 id 不能被名字重新解析一遍 —— 部门改过名之后，
 * 陈旧的名字缓存列指向的可能是**另一个**部门，而 id 才是真值。匹配不上的保持 NULL。
 */
function backfillEmployeeDepartment(): void {
  db.exec(`
    UPDATE employees
       SET departmentId = (
         SELECT MIN(d.id) FROM departments d
          WHERE d.name = employees.department
            AND NOT EXISTS (SELECT 1 FROM departments x WHERE x.name = d.name AND x.id <> d.id)
       )
     WHERE (departmentId IS NULL OR departmentId = '')
       AND department IS NOT NULL AND department != '';
  `);
}

function rebuildDepartments(): void {
  rebuildTable("departments", DEPARTMENTS_SCHEMA);
}

function rebuildRoles(): void {
  rebuildTable("roles", ROLES_SCHEMA);
}

function rebuildEmployees(): void {
  rebuildTable("employees", EMPLOYEES_SCHEMA);
  backfillEmployeeDepartment();
}

function rebuildSchedules(): void {
  rebuildTable("schedules", SCHEDULES_SCHEMA);
}

function rebuildPunchRecords(): void {
  rebuildTable("punch_records", PUNCH_RECORDS_SCHEMA);
}

function rebuildAnomalies(): void {
  rebuildTable("anomalies", ANOMALIES_SCHEMA);
}

function rebuildFolders(): void {
  rebuildTable("folders", FOLDERS_SCHEMA);
}

function rebuildDocuments(): void {
  rebuildTable("documents", DOCUMENTS_SCHEMA);
}

// ---------------------------------------------------------------- v14：数据一致性收口

/** 读某张表当前的建表语句（用来判断它是新形状还是旧形状，而不是靠版本号猜）。 */
function tableSql(name: string): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { sql: string } | undefined;
  return String(row?.sql ?? "");
}

/**
 * 剩余天数不再存列：用「已经不含这一列」的定义重建，顺带把外键补回来。
 * 判定按列是否存在，所以全新库（本来就没有）与恢复回来的老库都能正确收敛。
 */
function dropDerivedEmployeeColumn(): void {
  if (!tableExists("employees")) return;
  if (!columnsOf("employees").includes("daysToExpiry")) return;
  rebuildEmployees();
}

/**
 * 把旧形状的时间列换算成本地时间并重建表（改的是**列默认值**，SQLite 不能 ALTER 默认值）。
 *
 * 只认「有 createdAt 列、但建表语句里完全没有 localtime」这一种旧形状 —— 一旦重建过，
 * 新表自带 localtime，判定就不再命中，所以本步骤重复执行不会二次加时差。
 */
function rebuildTimestampColumnsToLocal(
  table: string,
  ensure: () => void,
  timestampCols: string[]
): void {
  const ddl = tableSql(table);
  const legacyShape = ddl !== "" && /\bcreatedAt\b/i.test(ddl) && !ddl.includes("localtime");
  if (!legacyShape) return;

  const backup = `${table}_v13_utc`;
  db.exec(`DROP TABLE IF EXISTS ${backup}`);
  db.exec(`ALTER TABLE ${table} RENAME TO ${backup}`);
  ensure(); // 先建新表（此刻旧索引名还被旧表占着，索引可能建不出来，下面补一次）
  const legacyCols = new Set(columnsOf(backup));
  const shared = columnsOf(table).filter((c) => legacyCols.has(c));
  const list = shared.map(quoteIdent).join(", ");
  const select = shared
    .map((c) =>
      timestampCols.includes(c)
        // 空串与坏值一律原样保留：一次性改写绝不能把时间列变成 NULL
        ? `COALESCE(NULLIF(datetime(NULLIF(${quoteIdent(c)}, ''), 'localtime'), ''), ${quoteIdent(c)}) AS ${quoteIdent(c)}`
        : quoteIdent(c)
    )
    .join(", ");
  db.exec(`INSERT INTO ${table} (${list}) SELECT ${select} FROM ${backup};`);
  db.exec(`DROP TABLE ${backup}`);
  ensure(); // 旧表的同名索引随 DROP 释放，这里把索引补回来
  console.log(`[migrate] ${table} 的旧 UTC 时间戳已换算为本地时间（${timestampCols.join("/")}）`);
}

/**
 * 只换算值、不动 DDL 的列：这几张表曾经用 `new Date().toISOString()` 写 `...T...Z`，
 * 而列的默认值是空格分隔的本地时间。两种格式混在一列里，`ORDER BY createdAt` 是文本序，
 * 'T'(0x54) > ' '(0x20)，同一天内两种来源的行会串位。
 * WHERE 条件限定「以 Z 结尾的 ISO 串」，换算完就不再命中，因此可重复执行。
 */
function convertIsoZValues(table: string, column: string): void {
  if (!tableExists(table)) return;
  const col = quoteIdent(column);
  const changed = db
    .prepare(
      `UPDATE ${quoteIdent(table)}
          SET ${col} = datetime(substr(${col}, 1, 19), 'localtime')
        WHERE ${col} LIKE '____-__-__T__:__:%' AND ${col} LIKE '%Z'`
    )
    .run();
  if (Number(changed.changes) > 0) {
    console.log(`[migrate] ${table}.${column}：${changed.changes} 行 ISO/UTC 时间戳已换算为本地时间`);
  }
}

/**
 * 班次规则补部门外键。先清孤儿：没有外键时删部门会留下谁也匹配不到的死规则
 * （resolveRulesForDepartment 按 departmentId 查，孤儿行既不命中也不清理，只会越积越多）。
 */
function ensureShiftRuleDepartmentFk(): void {
  if (!tableExists("dept_shift_rules")) return;
  if (tableSql("dept_shift_rules").includes("FOREIGN KEY")) return;
  const orphans = db
    .prepare(
      `DELETE FROM dept_shift_rules
        WHERE departmentId NOT IN (SELECT id FROM departments)`
    )
    .run();
  if (Number(orphans.changes) > 0) {
    console.warn(`[migrate] 部门工作时段：删除 ${orphans.changes} 条指向已不存在部门的规则`);
  }
  rebuildTable("dept_shift_rules", DEPT_SHIFT_RULES_SCHEMA);
  ensureShiftRulesTable(); // rebuild 会连带丢掉索引，这里按模块自己的定义补回
}

/** v14 总入口。每一步都自带形状判定，因此整步可重复执行。 */
function alignDataConsistency(): void {
  dropDerivedEmployeeColumn();
  rebuildTimestampColumnsToLocal("todos", ensureTodosTable, ["createdAt", "updatedAt"]);
  rebuildTimestampColumnsToLocal("notifications", ensureNotificationsTable, ["createdAt"]);
  convertIsoZValues("contract_renewals", "createdAt");
  convertIsoZValues("announcements", "createdAt");
  convertIsoZValues("business_forms", "createdAt");
  ensureShiftRuleDepartmentFk();
}

/**
 * v10：一个员工只允许绑定一个登录账号。
 *
 * accounts.employeeId 此前可以重复绑定，而 approvalsDb 与 attendanceRouter 都用
 * `SELECT username FROM accounts WHERE employeeId = ?` 的 .get() 取账号——重复绑定时
 * 只命中任意一条，另一条账号对应的员工永远收不到考勤异常通知，转正/补卡/离职的领域
 * 动作也会作用在错的人身上。这里先按「启用优先、其次最近修改」保留一条、其余解绑，
 * 再建部分唯一索引（NULL 与空串不参与唯一性：未开号的员工本就该留空）。
 * 幂等，导出供回归测试直接对种子数据断言。
 */
export function ensureUniqueAccountEmployeeBinding(): void {
  if (!tableExists("accounts")) return;

  const dupes = db
    .prepare(
      `SELECT employeeId FROM accounts
        WHERE employeeId IS NOT NULL AND employeeId <> ''
     GROUP BY employeeId HAVING COUNT(*) > 1`
    )
    .all() as Array<{ employeeId: string }>;

  let unbound = 0;
  for (const { employeeId } of dupes) {
    const keeper = db
      .prepare(
        `SELECT username FROM accounts WHERE employeeId = ?
          ORDER BY enabled DESC, updatedAt DESC, username ASC LIMIT 1`
      )
      .get(employeeId) as { username: string } | undefined;
    const kept = String(keeper?.username ?? "");
    unbound += Number(
      db
        .prepare(
          `UPDATE accounts SET employeeId = NULL, updatedAt = datetime('now','localtime')
            WHERE employeeId = ? AND username <> ?`
        )
        .run(employeeId, kept).changes
    );
  }

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_employeeId ON accounts(employeeId)
      WHERE employeeId IS NOT NULL AND employeeId <> ''`
  );

  if (unbound > 0) {
    console.log("[migrate] v10 已解除 %d 条重复的员工账号绑定（保留启用中/最近修改的那个）", unbound);
  }
}

/**
 * v11：同一员工同一分钟只允许一条打卡记录。
 *
 * punch_records 此前既无唯一键、`upsertRecord` 在缺 id 时又总是 mint 新 UUID，
 * 于是"补卡审批重跑 / 导入重跑 / 同人同日同刻两次提交"都会堆出重复行——
 * 而月报把 punchCount 与 workDays 直接建在这些行上，"仅一次打卡=缺卡"的判定也会反转。
 * 这里先把重复行合并成每组最早录入的那条，再建唯一索引；索引与常驻步骤一起执行，
 * 所以后续任何一次版本抬升都会重新确认它在位（导入通道用的是 ON CONFLICT，缺索引会直接报错）。
 * 幂等，导出供回归测试直接调用。
 */
export function ensurePunchRecordUniqueIndex(): void {
  if (!tableExists("punch_records")) return;

  const groups = db
    .prepare(
      `SELECT employeeId, date, time FROM punch_records
        GROUP BY employeeId, date, time HAVING COUNT(*) > 1`
    )
    .all() as unknown as Array<{ employeeId: string; date: string; time: string }>;

  let removed = 0;
  for (const g of groups) {
    removed += Number(
      db
        .prepare(
          `DELETE FROM punch_records
            WHERE employeeId = ? AND date = ? AND time = ?
              AND rowid NOT IN (
                SELECT MIN(rowid) FROM punch_records WHERE employeeId = ? AND date = ? AND time = ?
              )`
        )
        .run(g.employeeId, g.date, g.time, g.employeeId, g.date, g.time).changes
    );
  }

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_punch_employee_date_time ON punch_records(employeeId, date, time)`
  );

  if (removed > 0) console.log("[migrate] v11 已合并 %d 条重复打卡记录（每组保留最早录入的一条）", removed);
}

/**
 * v12：把展示用姓名快照与部门名副本对齐到档案真值。
 *
 * 各子表（schedules / punch_records / anomalies / overtime_ledger / contract_renewals /
 * business_forms）里的 employeeName 与 employees.department 都是写入时抄的副本，
 * 改名/改部门不会自动跟着走，于是出现「档案已改名、月报与异常列表还是旧名」
 * 「按新名在打卡记录里搜不到」「看板部门与员工列表不一致」。
 * 运行期由 db.ts 的 updateEmployee（改名）与 accounts/departments 联查负责，
 * 这里负责把存量漂移一次性拉平，并作为常驻步骤在每次版本抬升时自愈。幂等。
 */
export function syncDisplaySnapshots(): void {
  if (!tableExists("employees")) return;

  const nameTargets: Array<{ table: string; column?: string }> = [
    { table: "schedules" },
    { table: "punch_records" },
    { table: "anomalies" },
    { table: "overtime_ledger" },
    { table: "contract_renewals" },
    { table: "business_forms" },
  ];
  for (const { table } of nameTargets) {
    if (!tableExists(table)) continue;
    db.prepare(
      `UPDATE ${table}
          SET employeeName = (SELECT e.name FROM employees e WHERE e.id = ${table}.employeeId)
        WHERE employeeId IN (SELECT id FROM employees)
          AND employeeName <> (SELECT e.name FROM employees e WHERE e.id = ${table}.employeeId)`
    ).run();
  }

  db.prepare(
    `UPDATE employees
        SET department = (SELECT d.name FROM departments d WHERE d.id = employees.departmentId)
      WHERE departmentId IS NOT NULL
        AND department <> (SELECT d.name FROM departments d WHERE d.id = employees.departmentId)`
  ).run();
}

/**
 * v13：清掉「人已经删了、提醒还留着」的孤儿引用 —— todos.targetId 与
 * notifications.refKey（contract:{id} / probation:{id}）。
 *
 * 只在版本升级时跑一次，不做常驻：这两张表里的引用是"指向某人的待办/通知"，
 * 人不在就是纯噪音；而常驻删除在「先恢复待办、后恢复员工」这类备份还原时序里
 * 会误伤。新删除路径已在 db.ts 的 deleteEmployee 事务里同步清理，这里只补历史存量。
 */
export function pruneOrphanReminderRefs(): void {
  if (!tableExists("employees")) return;

  const todoHit = tableExists("todos")
    ? db
        .prepare(
          `DELETE FROM todos
            WHERE targetId IS NOT NULL AND targetId != ''
              AND targetId NOT IN (SELECT id FROM employees)`
        )
        .run()
    : { changes: 0 };
  const notifHit = tableExists("notifications")
    ? db
        .prepare(
          `DELETE FROM notifications
            WHERE (refKey LIKE 'contract:%' OR refKey LIKE 'probation:%')
              AND substr(refKey, instr(refKey, ':') + 1) NOT IN (SELECT id FROM employees)`
        )
        .run()
    : { changes: 0 };

  if (todoHit.changes || notifHit.changes) {
    console.log(
      "[migrate] v13 清理遗留提醒引用：待办 %d 条、通知 %d 条（指向已删除员工）",
      Number(todoHit.changes),
      Number(notifHit.changes)
    );
  }
}
