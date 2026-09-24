/**
 * data/uploads 孤儿文件扫描与清理（P3-6）。
 *
 * 文档删除时会同步删盘文件（documentsDb.removeStoredFile），但以下情况仍会产生孤儿文件：
 *  - 上传流中断 / 服务器崩溃，半截文件留在磁盘；
 *  - 数据库行被外部直接删除，磁盘文件未清理。
 * 本模块扫描 UPLOADS_DIR，对比 documents 表中仍被引用的 storedPath，找出无引用的孤儿文件，
 * 支持 dry-run（默认）与真实删除，并可按需挂载为定时扫描任务。
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.ts";
import { UPLOADS_DIR } from "./documentsDb.ts";

/** 返回 documents 表中所有仍被引用的 storedPath（绝对路径）。 */
export function listReferencedStoredPaths(): Set<string> {
  const rows = db
    .prepare(`SELECT storedPath FROM documents WHERE storedPath IS NOT NULL AND storedPath != ''`)
    .all() as { storedPath: string }[];
  const set = new Set<string>();
  for (const r of rows) set.add(path.resolve(r.storedPath));
  return set;
}

/** 扫描 UPLOADS_DIR，返回未被任何文档引用的磁盘文件绝对路径（孤儿）。 */
export function findOrphanUploads(): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return [];
  }
  // 用 basename 比较，规避不同平台路径分隔符差异（storedPath 与磁盘文件名本体一致）。
  const referencedNames = new Set([...listReferencedStoredPaths()].map((p) => path.basename(p)));
  const orphans: string[] = [];
  for (const name of entries) {
    const full = path.resolve(UPLOADS_DIR, name);
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue; // 跳过子目录
    if (!referencedNames.has(name)) orphans.push(full);
  }
  return orphans;
}

export interface CleanupResult {
  dryRun: boolean;
  found: number;
  removed: string[];
  errors: string[];
}

/** 清理孤儿文件。dryRun=true（默认）只报告不删除。 */
export function removeOrphanUploads(opts: { dryRun?: boolean } = {}): CleanupResult {
  const dryRun = opts.dryRun ?? true;
  const orphans = findOrphanUploads();
  const removed: string[] = [];
  const errors: string[] = [];
  for (const f of orphans) {
    if (dryRun) continue;
    try {
      fs.unlinkSync(f);
      removed.push(f);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${f}: ${msg}`);
    }
  }
  return { dryRun, found: orphans.length, removed, errors };
}

/**
 * 可选的定时孤儿扫描任务。默认不启用；设置 UPLOADS_ORPHAN_SCAN_MS（毫秒，>=60000）开启，
 * 例如 86400000 = 每天一次。默认只记录日志（dry-run）；设置 UPLOADS_ORPHAN_AUTODELETE=1 才真正删除。
 */
export function startOrphanUploadScan(): NodeJS.Timeout | null {
  const interval = Number(process.env.UPLOADS_ORPHAN_SCAN_MS || 0);
  if (!interval || interval < 60000) return null;
  const autoDelete = process.env.UPLOADS_ORPHAN_AUTODELETE === "1";
  console.log(
    `[uploads] 孤儿文件定时扫描已启用：每 ${Math.round(interval / 60000)} 分钟一次，自动删除=${autoDelete}`
  );
  const tick = () => {
    // 包一层 try：DB 抖动/表缺失时不能把异常抛成 uncaughtException（本站兜底是 process.exit(1)），
    // 否则一次定时扫描就能让整个服务退出
    try {
      const result = removeOrphanUploads({ dryRun: !autoDelete });
      if (result.found > 0) {
        console.warn(
          `[uploads] 发现 ${result.found} 个孤儿文件${autoDelete ? `，已删除 ${result.removed.length}` : "（dry-run，未删除）"}`
        );
        if (result.errors.length) console.error("[uploads] 删除失败：", result.errors);
      }
    } catch (e) {
      console.error("[uploads] 孤儿文件扫描失败：", e instanceof Error ? e.message : e);
    }
  };
  const timer = setInterval(tick, interval);
  // 与其它三个调度器一致：不阻止进程退出
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
