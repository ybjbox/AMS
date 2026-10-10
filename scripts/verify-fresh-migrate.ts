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
 *  [seed-on]  AMS_SEED_DEMO=1：照旧播 45 员工/部门树/角色/默认班次/默认文件夹。
 *  [seed-off] 不设该变量（真实部署的默认）：空库不播任何演示数据。
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
  const { runMigrations, SCHEMA_VERSION } = await import("../server/migrate.ts");
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
  check(`user_version 升级到 ${SCHEMA_VERSION}`, uv === SCHEMA_VERSION, `uv=${uv}`);

  const fk = (db.prepare("PRAGMA foreign_keys").get() as any).foreign_keys;
  check("迁移后 foreign_keys 已开启", fk === 1, `fk=${fk}`);

  // 月报默认月份：新库一条打卡都没有 → latestPunchMonth() 必须是 null，
  // 让 /summary 回退当月（而不是把 null 拼成 "null" 月份）。
  const attDb = await import("../server/attendanceDb.ts");
  check("新库 latestPunchMonth() 为 null", attDb.latestPunchMonth() === null, `got=${attDb.latestPunchMonth()}`);

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

  // 自建一名员工（不靠演示播种：播种默认已关闭，且夹具不该依赖它），
  // 部门名指向研发部，用来验证 departmentId 的回填逻辑。
  db.prepare("INSERT OR REPLACE INTO employees (id, name, department) VALUES ('EMP0001', '张三', '研发部')").run();
  const before = (db.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c;

  const { runMigrations, SCHEMA_VERSION } = await import("../server/migrate.ts");
  runMigrations();

  const after = (db.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c;
  check("旧库迁移后员工数据未丢", after === before, `before=${before} after=${after}`);

  const e1 = db.prepare("SELECT id, departmentId FROM employees WHERE id='EMP0001'").get() as any;
  check("部门名回填成 departmentId", !!e1 && e1.departmentId === "D-X", `got=${JSON.stringify(e1)}`);

  const r1 = db.prepare("SELECT departmentId FROM roles WHERE id='R1'").get() as any;
  check("roles.departmentId 经迁移保留", !!r1 && r1.departmentId === "D-X", `got=${JSON.stringify(r1)}`);

  const uv = (db.prepare("PRAGMA user_version").get() as any).user_version;
  check(`user_version 升级到 ${SCHEMA_VERSION}`, uv === SCHEMA_VERSION, `uv=${uv}`);

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

/** 运行器：用独立子进程分别跑 fresh / legacy / seed-on / seed-off，避免模块级 db 单例互相污染。 */
function main(): void {
  const scenarios = ["fresh", "legacy", "seed-on", "seed-off"];
  const tsxBin = resolveTsx();
  const here = fileURLToPath(import.meta.url);
  let anyFail = false;

  for (const s of scenarios) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ams-mig-${s}-`));
    // 只在 seed-on 显式开启演示数据；其余场景刻意不带这个变量，
    // 否则测的就不是「默认行为」了。
    const env: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: tmp };
    if (s === "seed-on") env.AMS_SEED_DEMO = "1";
    else delete env.AMS_SEED_DEMO;
    const r = spawnSync(tsxBin, [here], {
      env: { ...env, SCENARIO: s },
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

/** 场景 C：演示数据开关。默认空库不播任何演示数据；AMS_SEED_DEMO=1 才播。 */
async function runSeed(): Promise<void> {
  const wantDemo = process.env.AMS_SEED_DEMO === "1";
  const dbMod = await import("../server/db.ts");
  const { runMigrations } = await import("../server/migrate.ts");
  const db = dbMod.db;
  // 播种发生在各模块加载期，必须把所有会播种的模块都加载进来再数：
  // 部门/角色（departmentsDb）、默认班次（attendanceDb）、默认文件夹（documentsDb）。
  await import("../server/departmentsDb.ts");
  await import("../server/attendanceDb.ts");
  await import("../server/documentsDb.ts");
  runMigrations(); // 建表（播种不依赖迁移，迁移只补结构）

  const count = (t: string): number => {
    try {
      return (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as any).c;
    } catch {
      return -1;
    }
  };
  const actual = {
    employees: count("employees"),
    departments: count("departments"),
    roles: count("roles"),
    shifts: count("shifts"),
    folders: count("folders"),
  };

  if (wantDemo) {
    check("AMS_SEED_DEMO=1：播 45 名演示员工", actual.employees === 45, `got=${actual.employees}`);
    check("AMS_SEED_DEMO=1：播演示部门树", actual.departments === 15, `got=${actual.departments}`);
    check("AMS_SEED_DEMO=1：播角色", actual.roles === 7, `got=${actual.roles}`);
    check("AMS_SEED_DEMO=1：播默认班次", actual.shifts === 1, `got=${actual.shifts}`);
    check("AMS_SEED_DEMO=1：播默认文件夹", actual.folders === 4, `got=${actual.folders}`);
  } else {
    // 真实部署的默认：空库就是空的，真实数据走「员工导入 / 打卡导入」，
    // 免得 45 个「员工 N」和真人混在一张表里（2026-10-10 那次迁移就是为了清这个）。
    check(
      `默认不播演示数据（AMS_SEED_DEMO=${JSON.stringify(process.env.AMS_SEED_DEMO ?? null)}）`,
      dbMod.demoSeedEnabled() === false,
      `demoSeedEnabled=${dbMod.demoSeedEnabled()}`
    );
    check(
      "默认不播演示数据：员工/部门/角色/班次/文件夹全为空",
      Object.values(actual).every((n) => n === 0),
      JSON.stringify(actual)
    );
  }

  dbMod.closeDb();
  console.log(`\n[seed] 结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

const scenario = process.env.SCENARIO;
if (scenario === "fresh") {
  runFresh();
} else if (scenario === "legacy") {
  runLegacy();
} else if (scenario === "seed-on" || scenario === "seed-off") {
  runSeed();
} else {
  main();
}
