/**
 * v14 数据一致性收口的取证探针（由 vitest 以子进程方式运行，见 server/tests/schema-consistency.test.ts）。
 *
 * 为什么自己造旧库而不复制开发库：常驻化的判定全靠「库里的实际形状」，
 * 所以要的是**可控的旧形状**（UTC 默认值、带 daysToExpiry 列、无 FK 的班次规则、Z 结尾的时间戳），
 * 以及一个对照组（全新库跑完绝不能被换算两次）。
 *
 * 用法：DATA_DIR=<空目录> node --import tsx server/tests/fixtures/v14-probe.ts
 * 输出一行 `AMS_V14 <json>`。
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR;
if (!DATA_DIR) throw new Error("需要 DATA_DIR");
const FILE = path.join(DATA_DIR, "ams.db");

/** 把表打成 v13 的样子（列默认值用 UTC 的 datetime('now')、employees 带 daysToExpiry、规则表无 FK）。 */
function stampLegacyDb() {
  const db = new DatabaseSync(FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE departments (id TEXT PRIMARY KEY, name TEXT NOT NULL, priority INTEGER DEFAULT 0, parentId TEXT);
    CREATE TABLE employees (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT '在职',
      department TEXT DEFAULT '', departmentId TEXT,
      contractSignDate TEXT DEFAULT '', contractExpiry TEXT DEFAULT '',
      daysToExpiry INTEGER DEFAULT 0,
      updatedAt TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE todos (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, createdBy TEXT NOT NULL DEFAULT 'admin', assignee TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_todos_assignee ON todos(assignee);
    CREATE INDEX idx_todos_createdBy ON todos(createdBy);
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, recipient TEXT NOT NULL, read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')), refKey TEXT DEFAULT ''
    );
    CREATE INDEX idx_notifications_recipient ON notifications(recipient);
    CREATE TABLE dept_shift_rules (
      id TEXT PRIMARY KEY, departmentId TEXT NOT NULL, name TEXT NOT NULL,
      startTime TEXT NOT NULL, endTime TEXT NOT NULL, workdays TEXT NOT NULL DEFAULT '1,2,3,4,5'
    );
    CREATE TABLE business_forms (
      id TEXT PRIMARY KEY, employeeId TEXT NOT NULL, employeeName TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE contract_renewals (
      id TEXT PRIMARY KEY, employeeId TEXT NOT NULL, employeeName TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT ''
    );
    PRAGMA user_version = 13;
  `);
  db.prepare("INSERT INTO departments (id, name) VALUES ('D1','研发部'), ('D2','已不存在的部门')").run();
  db.prepare("INSERT INTO employees (id, name, contractExpiry, daysToExpiry, departmentId) VALUES (?,?,?,?,?)").run(
    "E1", "张三", "2026-12-31", 999, "D1"
  );
  // daysToExpiry 故意写 999（与 contractExpiry 不一致）→ 迁移后读到的必须是派生值
  db.prepare("INSERT INTO employees (id, name, contractExpiry, daysToExpiry) VALUES (?,?,?,?)").run(
    "E2", "李四", "", 999
  );
  db.prepare("INSERT INTO todos (id, title, assignee, createdAt, updatedAt) VALUES ('T1','旧待办','admin',?,?)")
    .run("2026-09-18 03:20:16", "2026-09-18 03:20:16");
  db.prepare("INSERT INTO todos (id, title, assignee) VALUES ('T2','走默认值的待办','admin')").run();
  db.prepare("INSERT INTO notifications (id, title, recipient, createdAt) VALUES ('N1','旧通知','admin',?)")
    .run("2026-09-20 15:45:45");
  db.prepare("INSERT INTO dept_shift_rules (id, departmentId, name, startTime, endTime) VALUES ('R1','D1','白班','08:00','17:00')").run();
  db.prepare("INSERT INTO dept_shift_rules (id, departmentId, name, startTime, endTime) VALUES ('R2','D-GONE','孤儿规则','08:00','17:00')").run();
  db.prepare("INSERT INTO business_forms (id, employeeId, createdAt) VALUES ('B1','E1','2026-09-21T01:02:03.000Z')").run();
  db.prepare("INSERT INTO contract_renewals (id, employeeId, createdAt) VALUES ('C1','E1','2026-09-22T04:05:06.000Z')").run();
  db.close();
}

/** 读回关心的事实。 */
function readFacts() {
  const db = new DatabaseSync(FILE, { readOnly: true });
  const all = (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>;
  const ddl = (t: string) => String(all(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`)[0]?.sql ?? "");
  const cols = (t: string) => (all(`SELECT name FROM pragma_table_info('${t}')`).map((r) => String(r.name)));
  const idx = (t: string) => all(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${t}' AND sql IS NOT NULL`).map((r) => String(r.name));
  const out = {
    version: Number(Object.values(all("PRAGMA user_version")[0])[0]),
    employeesCols: cols("employees"),
    employees: all("SELECT id, name, contractExpiry, departmentId FROM employees ORDER BY id"),
    todosDdl: ddl("todos"),
    todos: all("SELECT id, createdAt, updatedAt FROM todos ORDER BY id"),
    todoIndexes: idx("todos"),
    notifDdl: ddl("notifications"),
    notifications: all("SELECT id, createdAt FROM notifications ORDER BY id"),
    notifIndexes: idx("notifications"),
    rulesDdl: ddl("dept_shift_rules"),
    rules: all("SELECT id, departmentId FROM dept_shift_rules ORDER BY id"),
    rulesIndex: idx("dept_shift_rules"),
    forms: all("SELECT id, createdAt FROM business_forms ORDER BY id"),
    renewals: all("SELECT id, createdAt FROM contract_renewals ORDER BY id"),
    leftover: all("SELECT name FROM sqlite_master WHERE name LIKE '%_new' OR name LIKE '%_v13_utc'").map((r) => String(r.name)),
  };
  db.close();
  return out;
}

// ---- 场景 A：旧库升级 ----
// 先盖旧形状，再让模块加载：各模块的兜底建表都是 IF NOT EXISTS，看到已存在的表就不会改写它，
// 于是这才是「v13 库上跑 v14」的真实路径。
stampLegacyDb();
const legacy = readFacts();
// 真实的 v13 库里 documents/folders 一直存在（ensureIndexes 要在上面建索引），这里等价地补上
await import("../../documentsDb.ts");
const { runMigrations, SCHEMA_VERSION } = (await import("../../migrate.ts")) as unknown as {
  runMigrations: () => void;
  SCHEMA_VERSION: number;
};
runMigrations();
const upgraded = readFacts();
runMigrations(); // 第二次必须什么都没再改（尤其不能把时间再加一次 8 小时）
const twice = readFacts();

// 让默认值真的参与一次：插入一条不写 createdAt 的通知，看落库是否为本地时间
const live = new DatabaseSync(FILE);
live.prepare("INSERT INTO notifications (id, title, recipient) VALUES ('N3','默认值通知','admin')").run();
const defaultedAt = String(
  (live.prepare("SELECT createdAt FROM notifications WHERE id='N3'").get() as { createdAt: string }).createdAt
);
// 外键是否真的生效：删掉 D1 应连带删掉 R1；给不存在的部门插规则应被拒
live.exec("PRAGMA foreign_keys = ON");
live.prepare("DELETE FROM departments WHERE id = 'D1'").run();
const rulesAfterDeptDelete = (live.prepare("SELECT id FROM dept_shift_rules ORDER BY id").all() as { id: string }[]).map((r) => r.id);
const fkRejected = (() => {
  try {
    live.prepare("INSERT INTO dept_shift_rules (id, departmentId, name, startTime, endTime) VALUES ('R9','NOPE','x','08:00','17:00')").run();
    return "INSERT 成功了（外键没生效）";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
})();
live.close();
const finalFacts = readFacts();

console.log(
  `AMS_V14 ${JSON.stringify({
    SCHEMA_VERSION,
    legacy,
    upgraded,
    twice,
    defaultedAt,
    rulesAfterDeptDelete,
    fkRejected,
    finalFacts,
  })}`
);
