/**
 * 数据库备份与恢复（P1-7）。
 *
 * 背景：全部业务数据都在单个 data/ams.db，之前既无定时备份也无导出，
 * 磁盘损坏 / 误删 = 全公司人事数据归零。
 *
 * 设计要点：
 * 1. 备份用 SQLite 原生 `VACUUM INTO '<file>'` —— 在线热备份，不阻塞读写，
 *    产出的文件是自包含的完整库（不含 -wal / -shm），可直接拿去恢复。
 * 2. 定时备份 + 滚动保留（默认 7 天，由 BACKUP_RETENTION_DAYS 控制）。
 * 3. 恢复：先打一份「恢复前」安全备份，再把指定备份拷贝覆盖 ams.db，
 *    最后通过 db.reloadDb() 热重载连接（审计/安全模块的缓存语句也会重 prepare），
 *    全程不丢当前数据、不崩进程。
 * 4. 文件名做穿越校验，绝不允许 ../../ 这类路径。
 * 5. （第二梯队 #13）documents.storedPath 指向 data/uploads/ 的真实文件，
 *    只备 DB 会让「恢复后文档行存在、文件丢失」。因此每份备份 ams-x.db 都配一个
 *    同名 sidecar 目录 ams-x.db.uploads（uploads 的整目录快照）；恢复时若快照存在
 *    则一并回滚 uploads，旧备份无快照时保持 uploads 不动并在结果里如实上报。
 */
import fs from "fs";
import path from "path";
import { db, DB_PATH, closeDb, reloadDb } from "./db.ts";
import { UPLOADS_DIR } from "./documentsDb.ts";

const SQLITE_MAGIC = "SQLite format 3\u0000"; // 前 16 字节

/** 备份目录：<DATA_DIR>/backups */
export function backupDir(): string {
  const dir = path.join(path.dirname(DB_PATH), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface BackupMeta {
  name: string;
  path: string;
  size: number;
  /** ISO 本地时间字符串 */
  createdAt: string;
  /** 是否附带 uploads 目录快照（v2 备份才有；旧的纯 DB 备份为 false） */
  withUploads?: boolean;
}

/** 某份备份的 uploads 快照目录（sidecar，与 .db 同名加 .uploads 后缀） */
function uploadsSnapshotDir(backupName: string): string {
  return path.join(backupDir(), `${backupName}.uploads`);
}

/** 生成唯一备份文件名：ams-YYYYMMDD-HHmmss[.label].db（已存在则追加序号） */
function nextBackupName(label?: string): string {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHmmss
  const safe = label ? "." + label.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) : "";
  let base = `ams-${ts}${safe}.db`;
  let n = 2;
  while (fs.existsSync(path.join(backupDir(), base))) {
    base = `ams-${ts}${safe}-${n}.db`;
    n++;
  }
  return base;
}

/** 校验备份文件名，防止路径穿越 */
function resolveBackupPath(name: string): string {
  if (!name || /[\\/]/.test(name) || name.includes("..")) {
    throw new Error("非法的备份文件名");
  }
  return path.join(backupDir(), name);
}

/** 检查文件是否为合法 SQLite 数据库（读前 16 字节魔数） */
export function isSqliteFile(p: string): boolean {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return buf.toString("latin1", 0, 15) === SQLITE_MAGIC.slice(0, 15) && buf[15] === 0;
  } catch {
    return false;
  }
}

/**
 * 创建一份热备份。默认先 wal_checkpoint 把 WAL 数据落进主库，保证备份一致。
 * 返回备份元数据；任何失败都向上抛出，由调用方决定如何提示。
 */
export function createBackup(label?: string): BackupMeta {
  const name = nextBackupName(label);
  const target = path.join(backupDir(), name);
  const uploadsSnap = uploadsSnapshotDir(name);
  let withUploads = false;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    // VACUUM INTO 要求目标文件不存在，且产出自包含的完整库
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    // uploads 快照：与 DB 备份尽力同窗（秒级窗口内的新上传文件可能落在两侧之间，
    // 属可接受偏差——孤儿文件由 uploadsCleanup 兜底，缺文件在恢复场景里本就要人工核对）
    if (fs.existsSync(UPLOADS_DIR)) {
      fs.cpSync(UPLOADS_DIR, uploadsSnap, { recursive: true });
      withUploads = true;
    }
  } catch (e) {
    // 清理可能残留下来的半个文件 / 半个快照
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { force: true });
      fs.rmSync(uploadsSnap, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error(`备份失败：${e instanceof Error ? e.message : e}`, { cause: e });
  }
  const stat = fs.statSync(target);
  return { name, path: target, size: stat.size, createdAt: new Date().toISOString(), withUploads };
}

/** 列出全部备份，按时间倒序（最新在前） */
export function listBackups(): BackupMeta[] {
  const dir = backupDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".db"));
  const metas: BackupMeta[] = [];
  for (const f of files) {
    try {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      metas.push({
        name: f,
        path: p,
        size: st.size,
        createdAt: new Date(st.mtimeMs).toISOString(),
        withUploads: fs.existsSync(uploadsSnapshotDir(f)),
      });
    } catch {
      /* 读取失败的文件跳过 */
    }
  }
  metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return metas;
}

/** 删除超过保留期的备份，返回删除数量（保留期 <= 0 不删任何） */
export function pruneBackups(retentionDays = 7): number {
  if (retentionDays <= 0) return 0;
  const cutoff = Date.now() - retentionDays * 86400000;
  let removed = 0;
  for (const m of listBackups()) {
    if (new Date(m.createdAt).getTime() < cutoff) {
      try {
        fs.rmSync(m.path, { force: true });
        fs.rmSync(uploadsSnapshotDir(m.name), { recursive: true, force: true });
        removed++;
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

/**
 * 从指定备份恢复。流程：先打「恢复前」安全备份 → checkpoint → 关连接 →
 * 拷贝覆盖 ams.db（并清掉 -wal/-shm）→ 热重载连接。任何一步失败都会抛出，
 * 不会留下半截状态（拷贝前连接已关，且安全备份已就位）。
 */
export interface RestoreResult {
  restoredFrom: string;
  safetyBackup?: string;
  /** uploads 目录是否随备份一并回滚（旧备份无快照时保持现状并如实上报） */
  uploadsRestored: boolean;
}

export function restoreBackup(name: string, safetyLabel = "pre-restore"): RestoreResult {
  const src = resolveBackupPath(name);
  if (!fs.existsSync(src)) throw new Error("备份不存在");
  if (!isSqliteFile(src)) throw new Error("无效的备份文件（不是 SQLite 数据库）");

  // 1) 先保留当前状态，万一恢复后想反悔还有退路
  let safetyBackup: string | undefined;
  try {
    safetyBackup = createBackup(safetyLabel).name;
  } catch (e) {
    console.error("[backup] 恢复前安全备份失败（继续恢复）：", e);
  }

  // 2) 把 WAL 已提交数据落进主库，确保安全备份覆盖最新状态
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }

  // 3) 关旧连接 → 拷贝到临时文件 → 原子 rename → 清 WAL/SHM → 重开新连接
  //    （直接覆盖主库时若进程中断会留下损坏的半个文件；rename 保证主库要么是旧的、要么是完整的。
  //      Windows 下 rename 可能因残留句柄 EPERM，退化为直接覆盖；reloadDb 放 finally——
  //      恢复失败也不能把连接留在关闭态，否则服务彻底失能）
  closeDb();
  const tmpPath = `${DB_PATH}.restore-tmp`;
  try {
    fs.copyFileSync(src, tmpPath);
    try {
      fs.renameSync(tmpPath, DB_PATH);
    } catch (e) {
      console.warn("[backup] rename 覆盖主库失败，退回直接覆盖：", e);
      fs.copyFileSync(src, DB_PATH);
    }
    for (const ext of ["-wal", "-shm"]) {
      try {
        fs.rmSync(DB_PATH + ext, { force: true });
      } catch {
        /* ignore */
      }
    }
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      /* ignore */
    }
    reloadDb();
  }

  // 4) uploads 快照回滚：与恢复前安全备份（步骤 1，同样带 uploads 快照）配对，
  //    即使拷贝中途失败也有退路。快照不存在的旧备份只恢复 DB，不擅自动文件。
  const srcUploads = uploadsSnapshotDir(name);
  let uploadsRestored = false;
  if (fs.existsSync(srcUploads)) {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.cpSync(srcUploads, UPLOADS_DIR, { recursive: true });
    uploadsRestored = true;
  }

  return { restoredFrom: name, safetyBackup, uploadsRestored };
}

/** 删除单份备份（仅删备份文件与 uploads 快照，不影响线上库）。返回是否删除成功。 */
export function deleteBackup(name: string): boolean {
  const p = resolveBackupPath(name);
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { force: true });
  fs.rmSync(uploadsSnapshotDir(name), { recursive: true, force: true });
  return true;
}

export interface BackupConfig {
  enabled: boolean;
  retentionDays: number;
  intervalMs: number;
  backupDir: string;
  count: number;
}

/** 当前备份配置（供前端展示） */
export function getBackupConfig(): BackupConfig {
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || 7;
  const intervalMs = Number(process.env.BACKUP_INTERVAL_MS) || 86400000;
  const enabled = process.env.BACKUP_ENABLED !== "false";
  return {
    enabled,
    retentionDays,
    intervalMs,
    backupDir: backupDir(),
    count: listBackups().length,
  };
}

/**
 * 启动定时备份调度：启动时先做一轮清理，之后每 intervalMs 备份 + 清理。
 * 返回定时器（便于测试或优雅退出时 clear）。调度错误被吞掉，绝不拖垮服务。
 */
export function startBackupScheduler(): ReturnType<typeof setInterval> | null {
  const cfg = getBackupConfig();
  if (!cfg.enabled) {
    console.log("[backup] 自动备份已禁用（BACKUP_ENABLED=false）");
    return null;
  }
  try {
    pruneBackups(cfg.retentionDays);
  } catch (e) {
    console.error("[backup] 启动时清理旧备份失败：", e);
  }
  const timer = setInterval(() => {
    try {
      createBackup();
      pruneBackups(cfg.retentionDays);
    } catch (e) {
      console.error("[backup] 定时备份失败：", e);
    }
  }, cfg.intervalMs);
  // 不让定时器阻止进程退出（仅服务器长期运行需要）
  if (typeof timer.unref === "function") timer.unref();
  console.log(
    `[backup] 自动备份已启动：每 ${Math.round(cfg.intervalMs / 60000)} 分钟一次，保留 ${cfg.retentionDays} 天`
  );
  return timer;
}
