/**
 * 索引回归（P2-5，tsx 直连数据层，各场景独立子进程避免 db 单例污染）。
 *
 * 覆盖：
 *  [fresh]  全新库迁移后，EXPECTED_INDEXES 全部存在；插入足量数据后，
 *           documents.folderId / punch_records.employeeId / punch_records.date 的查询
 *           在 EXPLAIN QUERY PLAN 中命中索引（消除全表扫描）。
 *  [upgrade] 模拟「已升级到 v3 的库」：先 drop 掉索引并把 user_version 拨回 3，
 *           再跑一次 runMigrations，断言索引被重建（v3 -> v4 升级路径）。
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

function existingIndexes(db: any): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all() as any[]).map(
    (r) => r.name
  );
}

/** 判断某条查询是否命中期望索引（plan 文本含 "USING INDEX"）。 */
function usesIndex(db: any, sql: string, params: any[]): boolean {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as any[];
  const detail = rows.map((r) => r.detail ?? "").join(" | ");
  return /USING INDEX/.test(detail);
}

/** 场景 A：全新库 → 索引存在 + 查询计划命中索引。 */
async function runFresh(): Promise<void> {
  const dbMod = await import("../server/db.ts");
  const { runMigrations, EXPECTED_INDEXES, SCHEMA_VERSION } = await import("../server/migrate.ts");
  const db = dbMod.db;

  runMigrations();

  const idxs = existingIndexes(db);
  for (const e of EXPECTED_INDEXES) {
    check(`索引存在：${e.name} ON ${e.table}(${e.columns})`, idxs.includes(e.name));
  }
  const uv = (db.prepare("PRAGMA user_version").get() as any).user_version;
  check(`升级到 user_version=${SCHEMA_VERSION}`, uv === SCHEMA_VERSION, `uv=${uv}`);

  // 插入足量数据，逼出查询规划器对索引的偏好（行数少时规划器可能选全表扫描）。
  db.exec("BEGIN");
  for (let i = 0; i < 20; i++) {
    db.prepare("INSERT INTO employees (id, name) VALUES (?, ?)").run(`EMP${i}`, `员工${i}`);
  }
  // 3000 条打卡：分布在 20 名员工、跨 150 个日期
  // 日期按 i/20 递增而不是 i%150 —— punch_records 上 (employeeId, date, time) 是唯一的，
  // 取模会让每 300 条循环一次、造出重复打卡。
  const punch = db.prepare(
    "INSERT INTO punch_records (id, employeeId, employeeName, date, time) VALUES (?, ?, ?, ?, ?)"
  );
  for (let i = 0; i < 3000; i++) {
    const emp = `EMP${i % 20}`;
    const day = String(1 + Math.floor(i / 20)).padStart(2, "0");
    punch.run(`P${i}`, emp, `员工${i % 20}`, `2026-03-${day}`, "09:00");
  }
  // 800 个文档，分布到 5 个文件夹 + 部分未归类
  db.prepare("INSERT INTO folders (id, name) VALUES (?, ?)").run("F1", "人事");
  for (let i = 0; i < 800; i++) {
    const folder = i % 7 === 0 ? null : "F1";
    db.prepare("INSERT INTO documents (id, name, folderId) VALUES (?, ?, ?)").run(`D${i}`, `文档${i}`, folder);
  }
  db.exec("COMMIT");

  check(
    "punch_records.employeeId 查询命中索引",
    usesIndex(db, "SELECT * FROM punch_records WHERE employeeId = ?", ["EMP5"]),
    "期望 USING INDEX idx_punch_records_employeeId"
  );
  check(
    "punch_records.date 区间查询命中索引",
    usesIndex(db, "SELECT * FROM punch_records WHERE date >= ? AND date <= ?", ["2026-03-01", "2026-03-31"]),
    "期望 USING INDEX idx_punch_records_date"
  );
  check(
    "punch_records 组合(employeeId+date)查询命中索引",
    usesIndex(db, "SELECT * FROM punch_records WHERE employeeId = ? AND date >= ?", ["EMP5", "2026-03-01"]),
    "期望 USING INDEX"
  );
  check(
    "documents.folderId 查询命中索引",
    usesIndex(db, "SELECT * FROM documents WHERE folderId = ?", ["F1"]),
    "期望 USING INDEX idx_documents_folderId"
  );

  dbMod.closeDb();
  console.log(`\n[fresh] 结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

/** 场景 B：模拟已升级到 v3 的旧库，升级到 v4 时索引被重建。 */
async function runUpgrade(): Promise<void> {
  const dbMod = await import("../server/db.ts");
  const { runMigrations, EXPECTED_INDEXES, SCHEMA_VERSION } = await import("../server/migrate.ts");
  const db = dbMod.db;

  runMigrations(); // 现在 v4，索引已建
  check("首次迁移后索引存在", EXPECTED_INDEXES.every((e) => existingIndexes(db).includes(e.name)));

  // 模拟「v3 旧库」：drop 索引 + 把 user_version 拨回 3
  for (const e of EXPECTED_INDEXES) db.prepare(`DROP INDEX IF EXISTS ${e.name}`).run();
  db.exec("PRAGMA user_version = 3");
  const afterDrop = EXPECTED_INDEXES.filter((e) => existingIndexes(db).includes(e.name));
  check("drop 后索引消失（模拟升级前状态）", afterDrop.length === 0, `still=${afterDrop.join(",")}`);

  runMigrations(); // 重新迁移：current=3 < 4 → 重建索引
  const uv = (db.prepare("PRAGMA user_version").get() as any).user_version;
  check(`再次迁移升级到 user_version=${SCHEMA_VERSION}`, uv === SCHEMA_VERSION, `uv=${uv}`);
  for (const e of EXPECTED_INDEXES) {
    check(`升级路径重建索引：${e.name}`, existingIndexes(db).includes(e.name));
  }

  dbMod.closeDb();
  console.log(`\n[upgrade] 结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

function main(): void {
  const scenarios = ["fresh", "upgrade"];
  const tsxBin = resolveTsx();
  const here = fileURLToPath(import.meta.url);
  let anyFail = false;

  for (const s of scenarios) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ams-idx-${s}-`));
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
} else if (scenario === "upgrade") {
  runUpgrade();
} else {
  main();
}
