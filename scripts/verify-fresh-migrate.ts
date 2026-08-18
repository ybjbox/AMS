/**
 * 全新部署迁移回归（tsx 直连数据层，各场景独立子进程，互不污染单例 db）。
 *
 * 修复的 latent bug：全新库（db.ts 仅引导 employees、user_version=0）启动迁移时，
 * 旧逻辑在 `current < 1` 分支对不存在的 departments/roles 等表执行
 * `SELECT FROM <表>` 导致迁移崩溃、服务起不来。
 *
 * 覆盖：
 *  [fresh]  全新库：迁移不崩溃，建好全部带 FK 的表，user_version=5，
 *           FK 生效（悬空引用被拒、删部门置员工 departmentId 为 NULL）。
 *  [legacy] 旧式无 FK 库（所有表已存在但 user_version=0）：迁移后数据不丢，
 *           部门名回填为 departmentId，FK 生效。
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

function resolveTsx(): string {
  const bin = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const p = path.resolve("node_modules/.bin", bin);
  return fs.existsSync(p) ? p : "tsx";
}

/** 场景 A：全新库（仅 employees 被 db.ts 引导）迁移不崩溃且结构正确。 */
async function runFresh(): Promise<void> {
  const dbMod = await import("../server/db.ts");
  const { runMigrations } = await import("../server/migrate.ts");
  const db = dbMod.db;

  // 关键断言：这一步在修复前会因 SELECT FROM 不存在的 departments 而抛错。
  runMigrations();

  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(
    (r) => r.name
  );
  const core = [
    "employees",
    "departments",
    "roles",
    "schedules",
    "punch_records",
    "anomalies",
    "folders",
    "documents",
    "settings",
  ];
  check("全新库建好全部带 FK 的表", core.every((t) => tables.includes(t)), `tables=${tables.join(",")}`);

  const uv = (db.prepare("PRAGMA user_version").get() as any).user_version;
  check("user_version 升级到 5", uv === 5, `uv=${uv}`);

  const fk = (db.prepare("PRAGMA foreign_keys").get() as any).foreign_keys;
  check("迁移后 foreign_keys 已开启", fk === 1, `fk=${fk}`);

  // FK 生效：先建部门，再插入引用它的员工；悬空引用应被拒绝。
  db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run("D1", "研发部");
  db.prepare("INSERT INTO employees (id, name, departmentId) VALUES (?, ?, ?)").run("E1", "张三", "D1");
  let rejected = false;
  try {
    db.prepare("INSERT INTO employees (id, name, departmentId) VALUES (?, ?, ?)").run("E2", "李四", "NOPE");
  } catch {
    rejected = true;
  }
  check("悬空 departmentId 被 FK 拒绝", rejected);

  // 级联：删部门时员工 departmentId 置 NULL（ON DELETE SET NULL）。
  db.prepare("DELETE FROM departments WHERE id = 'D1'").run();
  const depId = (db.prepare("SELECT departmentId FROM employees WHERE id='E1'").get() as any).departmentId;
  check("删部门后员工 departmentId 置 NULL（SET NULL）", depId === null, `depId=${depId}`);

  dbMod.closeDb();
  console.log(`\n[fresh] 结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

/** 场景 B：旧式无 FK 库（所有表已存在、user_version=0）迁移后数据保留 + FK 生效。 */
async function runLegacy(): Promise<void> {
  const dbMod = await import("../server/db.ts"); // 引导 employees 并播种 45 条
  const db = dbMod.db;

  // 手工建「旧式」无 FK 表，模拟迁移前的库。
  db.exec(`CREATE TABLE departments (id TEXT PRIMARY KEY, name TEXT NOT NULL, priority INTEGER DEFAULT 0, parentId TEXT)`);
  db.exec(`INSERT INTO departments (id, name) VALUES ('D-X', '研发部')`);
  db.exec(`CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, departmentId TEXT NOT NULL, priority INTEGER DEFAULT 0)`);
  db.exec(`INSERT INTO roles (id, name, departmentId) VALUES ('R1', '前端工程师', 'D-X')`);
  db.exec(`CREATE TABLE schedules (employeeId TEXT PRIMARY KEY, employeeName TEXT NOT NULL, shiftIds TEXT DEFAULT '[]')`);
  db.exec(`CREATE TABLE punch_records (id TEXT PRIMARY KEY, employeeId TEXT NOT NULL, employeeName TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL)`);
  db.exec(`CREATE TABLE anomalies (id TEXT PRIMARY KEY, employeeId TEXT NOT NULL, employeeName TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, minutes INTEGER, description TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, parentId TEXT)`);
  db.exec(`CREATE TABLE documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT '', url TEXT DEFAULT '', size INTEGER DEFAULT 0, uploadedAt TEXT DEFAULT '', folderId TEXT, storedPath TEXT DEFAULT '')`);

  // 让一名已播种员工部门名指向研发部，验证回填逻辑。
  db.prepare("UPDATE employees SET department = '研发部' WHERE id = 'EMP0001'").run();
  const before = (db.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c;

  const { runMigrations } = await import("../server/migrate.ts");
  runMigrations();

  const after = (db.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c;
  check("旧库迁移后员工数据未丢", after === before, `before=${before} after=${after}`);

  const e1 = db.prepare("SELECT id, departmentId FROM employees WHERE id='EMP0001'").get() as any;
  check("部门名回填成 departmentId", !!e1 && e1.departmentId === "D-X", `got=${JSON.stringify(e1)}`);

  const r1 = db.prepare("SELECT departmentId FROM roles WHERE id='R1'").get() as any;
  check("roles.departmentId 经迁移保留", !!r1 && r1.departmentId === "D-X", `got=${JSON.stringify(r1)}`);

  const uv = (db.prepare("PRAGMA user_version").get() as any).user_version;
  check("user_version 升级到 5", uv === 5, `uv=${uv}`);

  let rejected = false;
  try {
    db.prepare("INSERT INTO employees (id, name, departmentId) VALUES (?, ?, ?)").run("EX", "x", "NOPE");
  } catch {
    rejected = true;
  }
  check("迁移后 FK 生效（悬空引用被拒）", rejected);

  dbMod.closeDb();
  console.log(`\n[legacy] 结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

/** 运行器：用独立子进程分别跑 fresh / legacy，避免模块级 db 单例互相污染。 */
function main(): void {
  const scenarios = ["fresh", "legacy"];
  const tsxBin = resolveTsx();
  const here = fileURLToPath(import.meta.url);
  let anyFail = false;

  for (const s of scenarios) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ams-mig-${s}-`));
    const r = spawnSync(tsxBin, [here], {
      env: { ...process.env, SCENARIO: s, DATA_DIR: tmp },
      stdio: "inherit",
      shell: true,
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    if (r.status !== 0) {
      anyFail = true;
      console.error(`\n✗ 场景 ${s} 失败（exit=${r.status}）`);
    } else {
      console.log(`✓ 场景 ${s} 通过`);
    }
  }

  console.log(`\n总结果：${anyFail ? "存在失败" : "全部通过"}`);
  process.exit(anyFail ? 1 : 0);
}

const scenario = process.env.SCENARIO;
if (scenario === "fresh") {
  runFresh();
} else if (scenario === "legacy") {
  runLegacy();
} else {
  main();
}
