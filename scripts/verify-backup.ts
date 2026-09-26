/**
 * P1-7 备份机制回归（tsx 直连数据层，独立临时 DATA_DIR，不触碰真实库）。
 *
 * 覆盖：
 *  1. createBackup 落盘且产出合法 SQLite（VACUUM INTO 热备份）
 *  2. listBackups 倒序、pruneBackups 按保留期清理旧备份
 *  3. restoreBackup 热重载连接后数据正确回退（恢复前先打安全备份）
 *  4. 无效备份文件（非 SQLite）被拒绝
 *  5. 文件名穿越被拒绝
 *  6. 截断/损坏的备份被 integrity_check 拦下，线上库原封不动
 */
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ams-backup-test-"));
  process.env.DATA_DIR = tmp;

  const dbMod = await import("../server/db.ts");
  const backup = await import("../server/backupDb.ts");

  // db.ts 加载时即建好 employees 表（本回归只依赖它做增删/备份/恢复验证）
  const db = dbMod.db;

  console.log("[1] createBackup 落地 + 合法 SQLite");
  const meta = backup.createBackup("manual");
  check("备份文件存在", fs.existsSync(meta.path));
  check("备份是合法 SQLite", backup.isSqliteFile(meta.path));
  check("备份文件可被只读打开", (() => {
    try {
      const ro = new DatabaseSync(meta.path, { readOnly: true });
      const n = (ro.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c;
      ro.close();
      return typeof n === "number";
    } catch {
      return false;
    }
  })());

  console.log("[2] listBackups 倒序 + pruneBackups 滚动保留");
  // 再建一份，然后人为把第一份 mtime 改成 10 天前
  const meta2 = backup.createBackup("second");
  const oldPath = meta.path;
  const oldTime = Date.now() / 1000 - 10 * 86400;
  fs.utimesSync(oldPath, oldTime, oldTime);
  const list = backup.listBackups();
  check("列表至少 2 份", list.length >= 2);
  check("列表按时间倒序（最新在前）", list[0].createdAt >= list[list.length - 1].createdAt);
  const removed = backup.pruneBackups(7);
  check("超过 7 天的旧备份被清理", removed >= 1, `removed=${removed}`);
  check("旧备份文件已删除", !fs.existsSync(oldPath));
  check("近期备份保留", fs.existsSync(meta2.path));

  console.log("[3] restoreBackup 热恢复数据正确");
  // 当前状态：插入 Alice（用不会和种子 45 条数据冲突的 id）
  db.prepare("INSERT INTO employees (id, name) VALUES (?, ?)").run("BKUP01", "Alice");
  const snap = backup.createBackup("snap-alice");
  // 之后把 Alice 改成 Bob，并新增 Carol
  db.prepare("UPDATE employees SET name = ? WHERE id = ?").run("Bob", "BKUP01");
  db.prepare("INSERT INTO employees (id, name) VALUES (?, ?)").run("BKUP02", "Carol");
  // 恢复到 snap-alice：Alice 应回来，Carol 应消失
  const res = backup.restoreBackup(snap.name);
  check("恢复返回 restoredFrom", res.restoredFrom === snap.name);
  check("恢复前已打安全备份", !!res.safetyBackup);
  const afterAlice = (dbMod.db.prepare("SELECT name FROM employees WHERE id = ?").get("BKUP01") as any)?.name;
  const afterCarol = dbMod.db.prepare("SELECT name FROM employees WHERE id = ?").get("BKUP02");
  check("恢复后 Alice 回归", afterAlice === "Alice", `got=${afterAlice}`);
  check("恢复后 Carol 不存在", afterCarol === undefined);
  // 热重载后审计/安全缓存语句若已注册也应仍可用；这里没注册，仅验证连接可用
  check("恢复后连接可读", typeof (dbMod.db.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c === "number");

  console.log("[4] 无效备份文件被拒绝");
  const fake = path.join(backup.backupDir(), "fake.db");
  fs.writeFileSync(fake, "this is not a sqlite file");
  let threw = false;
  try {
    backup.restoreBackup("fake.db");
  } catch (e: any) {
    threw = /无效的备份文件/.test(e?.message ?? "");
  }
  check("恢复非 SQLite 文件抛「无效的备份文件」", threw);
  fs.rmSync(fake, { force: true });

  console.log("[5] 文件名穿越被拒绝");
  let threwTraversal = false;
  try {
    backup.restoreBackup("../escape.db");
  } catch (e: any) {
    threwTraversal = /非法的备份文件名/.test(e?.message ?? "");
  }
  check("穿越文件名抛「非法的备份文件名」", threwTraversal);
  let threwDelete = false;
  try {
    backup.deleteBackup("../../etc/passwd");
  } catch (e: any) {
    threwDelete = /非法的备份文件名/.test(e?.message ?? "");
  }
  check("删除穿越文件名同样被拒", threwDelete);

  console.log("[6] 校验不通过的备份不能换掉线上库");
  const backupsDir = path.dirname(meta2.path);
  const srcSnap = backup.createBackup("integrity-src");
  // 必须走 dbMod.db：恢复之后 reloadDb() 换了连接，脚本开头抓的那个 handle 已经关掉了
  dbMod.db.prepare("INSERT INTO employees (id, name) VALUES (?, ?)").run("BKUP03", "可辨识的行");
  // 半份拷贝：魔数（头 16 字节）在、正文缺 —— isSqliteFile 挡不住，只有 integrity_check 挡得住
  const full = fs.readFileSync(srcSnap.path);
  fs.writeFileSync(path.join(backupsDir, "truncated.db"), full.subarray(0, Math.floor(full.length * 0.55)));
  let corruptErr = "";
  try {
    backup.restoreBackup("truncated.db");
  } catch (e: unknown) {
    corruptErr = e instanceof Error ? e.message : String(e);
  }
  check("截断过的备份被拒，并说明是校验没过", /校验未通过/.test(corruptErr), corruptErr);
  check(
    "线上库没有被换掉（可辨识的行还在）",
    (dbMod.db.prepare("SELECT name FROM employees WHERE id = ?").get("BKUP03") as { name?: string })?.name ===
      "可辨识的行"
  );
  check("失败路径没留下 .restore-tmp 垃圾", !fs.existsSync(path.join(tmp, "ams.db.restore-tmp")));

  // 收尾
  dbMod.closeDb();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁，忽略 */
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("回归脚本异常：", e);
  process.exit(1);
});
