/**
 * 子进程探针：在一个全新的 DATA_DIR 上验证运维可靠性。
 * 由 ops-reliability.test.ts 拉起（DATA_DIR 由父进程通过环境变量给）。
 *
 * 覆盖的都是"生产里出事没人知道"的那类：
 * - 库不可用时探针真的变 503（以前恒 200，容器一直 healthy 地写着失败）；
 * - 导出脚本模板住在数据卷里，且管理员改过的那份不会被镜像种子覆盖；
 * - 备份按份数/总量收口（每份都带 uploads + 模板快照，只按天数删会写满磁盘）；
 * - 同一数据目录上的其它实例可见（恢复备份要靠它拒 409）。
 */
import fs from "fs";
import path from "path";
import { DATA_DIR, db, closeDb, reloadDb } from "../../db.ts";
import { probeHealth } from "../../health.ts";
import { TEMPLATES_DIR, listTemplates, writeTemplate } from "../../templateStore.ts";
import { freeBytesAt, pruneBackups, backupDir, type BackupMeta } from "../../backupDb.ts";
import { otherInstances, startInstanceHeartbeat, stopInstanceHeartbeat } from "../../instanceLock.ts";

const out: Record<string, unknown> = {};

// ---- 1) 探针状态码随库的可用性走 ----
out.healthUp = probeHealth("test").code;
closeDb();
// 关掉连接后 SELECT 1 必抛 —— 这正是"进程还在但服务不可用"的形态；
// 探针必须因此回 503，否则容器会一直 healthy 地写着失败。
out.healthDown = (() => {
  try {
    return probeHealth("test").code;
  } catch {
    return -1;
  }
})();
reloadDb();
out.healthBackUp = probeHealth("test").code;
db.prepare("SELECT 1").get();

// ---- 2) 模板在数据卷里，且升级不会覆盖管理员改过的那份 ----
out.templatesInDataDir = path.resolve(TEMPLATES_DIR) === path.resolve(path.join(DATA_DIR, "templates"));
fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
fs.writeFileSync(path.join(TEMPLATES_DIR, "default_script.js"), "// 管理员改过的版本\n");
const seeded = await listTemplates();
out.customSurvivesSeed = seeded.find((t) => t.name === "default_script")?.code.trim() === "// 管理员改过的版本";
// 卷里没有的其他种子模板照常补进来
out.bundleSeeded = fs.existsSync(path.join(TEMPLATES_DIR, "default_script.js"));
await writeTemplate("运维探针模板", "exports.map = [];");
out.writtenOnDisk = fs.existsSync(path.join(TEMPLATES_DIR, "运维探针模板.js"));

// ---- 3) 备份滚动清理的上界 ----
const dir = backupDir();
const mk = (name: string, ageDays: number, size = 1000): void => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(size, 7));
  const t = new Date(Date.now() - ageDays * 86400000);
  fs.utimesSync(p, t, t);
};
for (let i = 1; i <= 8; i += 1) mk(`ams-old-${String(i).padStart(2, "0")}.db`, i * 2);
// retentionDays=0（不按年龄删）时，份数上限仍然必须生效
out.prunedByCount = pruneBackups(0, { maxCount: 3 });
out.remainAfterCountPrune = fs.readdirSync(dir).filter((f) => f.endsWith(".db")).length;
for (let i = 1; i <= 6; i += 1) mk(`ams-bytes-${String(i).padStart(2, "0")}.db`, i);
// 总量上限：只留最新的，至少保一份
out.prunedByBytes = pruneBackups(0, { maxCount: 99, maxTotalBytes: 2500 });
const left: BackupMeta[] = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".db"))
  .map((f) => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size, createdAt: "" }));
out.keepsNewest = left.some((m) => m.name.includes("bytes-01"));
out.atLeastOneKept = left.length >= 1;
out.freeBytesPositive = (freeBytesAt(dir) ?? 0) > 0;

// ---- 4) 同一数据目录上的其它实例 ----
startInstanceHeartbeat(4321, "127.0.0.1");
fs.writeFileSync(path.join(DATA_DIR, ".instance-9999.json"), JSON.stringify({ pid: 999999, port: 999999, host: "127.0.0.1", startedAt: new Date().toISOString() }));
const stale = path.join(DATA_DIR, ".instance-7777.json");
fs.writeFileSync(stale, JSON.stringify({ pid: 1, port: 7777, host: "127.0.0.1", startedAt: "2020-01-01" }));
fs.utimesSync(stale, new Date(Date.now() - 10 * 60 * 1000), new Date(Date.now() - 10 * 60 * 1000));
const others = otherInstances().map((i) => i.port);
out.seesOtherInstance = others.includes(999999);
out.ignoresStaleInstance = !others.includes(7777);
stopInstanceHeartbeat();
out.selfFileRemoved = !fs.existsSync(path.join(DATA_DIR, ".instance-4321.json"));

console.log("AMS_PROBE " + JSON.stringify(out));
