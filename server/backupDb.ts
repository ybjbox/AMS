/**
 * 数据库备份与恢复（P1-7）。
 *
 * 背景：全部业务数据都在单个 data/ams.db，之前既无定时备份也无导出，
 * 磁盘损坏 / 误删 = 全公司人事数据归零。
 *
 * 设计要点：
 * 1. 备份用 SQLite 原生 `VACUUM INTO` —— 在线热备份，不阻塞读写，产出**自包含的完整库**
 *    （不含 -wal / -shm）。它是单文件备份的最后一块：库 + `data/uploads/` 快照 +
 *    `data/templates/` 快照 + manifest.json 一起打进一个 `ams-<时间戳>.zip`。
 * 2. 为什么要打成单文件：恢复前必然要跨机器搬（本机 → NAS、NAS → 移动盘），
 *    而上一代形态是三件套（`ams-x.db` + 两个同名 sidecar 目录），导出接口只能流那个
 *    `.db`，两个目录走不了 HTTP —— "下载一份完整备份"在界面上就凑不齐。
 *    现在导出=一个文件、导入=一个文件、列表一行就是一个文件。
 * 3. **老的三件套备份继续可读**（`openBackup` 按扩展名分派），所以这版改动不用先迁历史。
 * 4. 定时备份 + 滚动保留（默认 7 天，由 BACKUP_RETENTION_DAYS 控制），
 *    以及份数 / 总容量两个上界 —— 见 pruneBackups。
 * 5. 恢复：先打一份「恢复前」安全备份，再把归档里的库拷去覆盖 ams.db，
 *    热重载连接（审计/安全模块的缓存语句也会重 prepare），uploads/模板快照存在才一并回滚，
 *    不存在就保持现状并在结果里如实上报。全程不丢当前数据、不崩进程。
 * 6. 文件名做穿越校验，绝不允许 ../../ 这类路径；解包时条目名还要再过一道白名单
 *    （见 backupArchive.ts —— 那是外部送进来的字节，不能信）。
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { db, DB_PATH, closeDb, reloadDb } from "./db.ts";
import { runMigrations } from "./migrate.ts";
import { UPLOADS_DIR } from "./documentsDb.ts";
import { TEMPLATES_DIR } from "./templateStore.ts";
import {
  writeArchiveZip,
  extractArchiveZip,
  listFilesRel,
  isZipFile,
  type BackupManifest,
} from "./backupArchive.ts";

/**
 * 产出这份备份的应用版本，写进 manifest 供跨机排查（"是哪个版本导的"）。
 * 取不到就留空 —— 它是元信息，不该把备份本身搞失败。
 */
const APP_VERSION: string | undefined = (() => {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as { version?: string }
    ).version;
  } catch {
    return undefined;
  }
})();

const SQLITE_MAGIC = "SQLite format 3\u0000"; // 前 16 字节

/** 备份目录：<DATA_DIR>/backups */
export function backupDir(): string {
  const dir = path.join(path.dirname(DB_PATH), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 磁盘剩余不足时备份/恢复会留下半个文件，且之后每一次写都在加深损坏。
 * 这里在动手前先算一次账，不够就直接拒绝（比事后清理便宜得多）。
 */
export class BackupCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupCapacityError";
  }
}

/** 卷上可用字节数；平台/文件系统拿不到时返回 null（不因此拒绝备份） */
export function freeBytesAt(dir: string): number | null {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** 目录占用字节数（递归，文件数设上限，避免大目录把事件循环钉住） */
function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function treeSize(dir: string, budget = { files: 20000 }): number {
  let total = 0;
  for (const e of readDirents(dir)) {
    if (budget.files-- <= 0) break;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += treeSize(p, budget);
    else {
      try {
        total += fs.statSync(p).size;
      } catch {
        /* 单个文件量不到不影响估算 */
      }
    }
  }
  return total;
}

/** 一份新备份大概要吃掉多少字节（DB + uploads 快照 + 模板快照 + 5% 余量） */
function estimateBackupBytes(): number {
  let dbSize = 0;
  try {
    dbSize = fs.statSync(DB_PATH).size;
  } catch {
    /* 库还没落地时按 0 估 */
  }
  return Math.ceil((dbSize + treeSize(UPLOADS_DIR) + treeSize(TEMPLATES_DIR, { files: 200 })) * 1.05);
}

export interface BackupMeta {
  name: string;
  path: string;
  size: number;
  /** ISO 本地时间字符串 */
  createdAt: string;
  /**
   * 归档格式。`zip` = v3 单文件（库 + uploads + 模板都在里面）；
   * `legacy` = v1/v2 的 `ams-x.db` + 同名 `.uploads/` `.templates/` sidecar 目录。
   * 读侧两种都支持，新产的备份一律是 zip。
   */
  format: "zip" | "legacy";
  /**
   * 是否附带 uploads 目录快照。legacy 按 sidecar 目录是否存在判断；
   * zip 恒为 undefined —— 单文件归档本来就带这两块，不需要再问，
   * 面板对 zip 直接显示"整套归档"而不是这一个布尔。
   */
  withUploads?: boolean;
}

/** 某份备份的 uploads 快照目录（sidecar，与 .db 同名加 .uploads 后缀） */
function uploadsSnapshotDir(backupName: string): string {
  return path.join(backupDir(), `${backupName}.uploads`);
}

/**
 * 导出脚本模板的快照目录。模板现在住在 DATA_DIR/templates，
 * 与数据卷同生共死，但只有纳入备份才能回答「回到三周前的库 + 那套模板」。
 */
function templatesSnapshotDir(backupName: string): string {
  return path.join(backupDir(), `${backupName}.templates`);
}

/**
 * 生成唯一备份文件名：ams-YYYYMMDD-HHmmss[.label].<ext>（已存在则追加序号）。
 * 新备份是 `.zip`；`.db` 只留给导入外来纯库文件的老场景（v1 形态，没有文件快照）。
 */
function nextBackupName(label?: string, ext = "zip"): string {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHmmss
  const safe = label ? "." + label.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) : "";
  let base = `ams-${ts}${safe}.${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(backupDir(), base))) {
    base = `ams-${ts}${safe}-${n}.${ext}`;
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

/** 最近一次备份的结果（成功的或失败的），供健康检查与诊断面板回答"备份还活着吗" */
export interface BackupRun {
  at: string;
  ok: boolean;
  detail: string;
}

let lastRun: BackupRun | null = null;

export function getLastBackupRun(): BackupRun | null {
  return lastRun;
}

/**
 * 创建一份热备份，产出**单个** `ams-<时间戳>.zip`。
 *
 * 流程：wal_checkpoint → `VACUUM INTO` 到临时库 → 打包（库 + uploads + 模板 + manifest）
 * → 删临时库。VACUUM INTO 的产物必须在打包前落成磁盘上的真实文件，所以这里用一个
 * `._staging-*` 中转；它和半份归档一样，任何失败路径都要清掉。
 *
 * 返回备份元数据；任何失败都向上抛出，由调用方决定如何提示。
 */
export async function createBackup(label?: string): Promise<BackupMeta> {
  const dir = backupDir();
  const free = freeBytesAt(dir);
  const needed = estimateBackupBytes();
  if (free !== null && free < needed) {
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    lastRun = { at: new Date().toISOString(), ok: false, detail: "磁盘剩余不足，已跳过本次备份" };
    throw new BackupCapacityError(
      `磁盘空间不足：预计需要约 ${mb(needed)} MB，仅剩 ${mb(free)} MB。请先清理 ${dir} 或扩容后再备份。`
    );
  }
  const name = nextBackupName(label);
  const target = path.join(dir, name);
  const stageDb = path.join(dir, `._staging-${process.pid}-${Date.now()}.db`);
  const createdAt = new Date().toISOString();
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    // VACUUM INTO 要求目标文件不存在，且产出自包含的完整库（不含 -wal / -shm）
    db.exec(`VACUUM INTO '${stageDb.replace(/'/g, "''")}'`);
    // uploads / 模板快照与库备份尽力同窗（秒级窗口内的新上传文件可能落在两侧之间，
    // 属可接受偏差——孤儿文件由 uploadsCleanup 兜底，缺文件在恢复场景里本就要人工核对）
    const withUploads = listFilesRel(UPLOADS_DIR).length > 0;
    const withTemplates = listFilesRel(TEMPLATES_DIR).length > 0;
    await writeArchiveZip(target, {
      dbFile: stageDb,
      uploadsDir: withUploads ? UPLOADS_DIR : undefined,
      templatesDir: withTemplates ? TEMPLATES_DIR : undefined,
      manifest: {
        version: 3,
        createdAt,
        appVersion: APP_VERSION,
        sourceDbPath: DB_PATH,
        withUploads,
        withTemplates,
        dbBytes: fs.statSync(stageDb).size,
      },
    });
  } catch (e) {
    // 清理可能残留下来的半份归档与临时库
    try {
      fs.rmSync(target, { force: true });
      fs.rmSync(stageDb, { force: true });
    } catch {
      /* ignore */
    }
    lastRun = { at: new Date().toISOString(), ok: false, detail: e instanceof Error ? e.message : String(e) };
    throw new Error(`备份失败：${e instanceof Error ? e.message : e}`, { cause: e });
  }
  try {
    fs.rmSync(stageDb, { force: true });
  } catch {
    /* 临时库没删掉只占空间，归档已经写完了，不能因此把这次备份报成失败 */
  }
  const stat = fs.statSync(target);
  lastRun = { at: new Date().toISOString(), ok: true, detail: name };
  return { name, path: target, size: stat.size, createdAt, format: "zip" };
}

/** 列出全部备份，按时间倒序（最新在前）。zip 与遗留的 .db 混列，靠 format 区分 */
export function listBackups(): BackupMeta[] {
  const dir = backupDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".zip") || f.endsWith(".db"));
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
        format: f.endsWith(".zip") ? "zip" : "legacy",
        withUploads: f.endsWith(".zip") ? undefined : fs.existsSync(uploadsSnapshotDir(f)),
      });
    } catch {
      /* 读取失败的文件跳过 */
    }
  }
  metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return metas;
}

/** 一份备份解出来的可恢复材料；`cleanup` 必须调用（zip 会在备份目录里留临时树） */
export interface OpenedBackup {
  format: "zip" | "legacy";
  /** 可直接 copy 覆盖主库的 SQLite 文件 */
  dbFile: string;
  /** uploads 快照目录；没有快照（或快照为空）时为 null */
  uploadsDir: string | null;
  templatesDir: string | null;
  manifest: BackupManifest | null;
  cleanup: () => void;
}

/**
 * 把一份备份读成「库文件 + 两个可选快照目录」。
 *
 * 这是新旧两种形态唯一的分叉点：`restoreBackup` 及它之后的一切都不再关心备份是
 * zip 还是三件套。zip 解到 `._extract-<随机>` 临时目录，调用方 cleanup 后不留痕迹。
 */
export async function openBackup(name: string): Promise<OpenedBackup> {
  const p = resolveBackupPath(name);
  if (!fs.existsSync(p)) throw new Error("备份不存在");

  if (name.endsWith(".zip")) {
    const into = path.join(backupDir(), `._extract-${process.pid}-${Math.random().toString(36).slice(2, 10)}`);
    const got = await extractArchiveZip(p, into);
    return {
      format: "zip",
      dbFile: got.dbFile,
      uploadsDir: got.uploadsDir,
      templatesDir: got.templatesDir,
      manifest: got.manifest,
      cleanup: got.cleanup,
    };
  }

  const legacyUploads = uploadsSnapshotDir(name);
  const legacyTemplates = templatesSnapshotDir(name);
  return {
    format: "legacy",
    dbFile: p,
    uploadsDir: fs.existsSync(legacyUploads) ? legacyUploads : null,
    templatesDir: fs.existsSync(legacyTemplates) ? legacyTemplates : null,
    manifest: null,
    cleanup: () => {},
  };
}

/** 删除一份备份的全部产物（zip 单文件；legacy 的 .db + 两个快照目录） */
function removeBackupArtifacts(m: BackupMeta): void {
  fs.rmSync(m.path, { force: true });
  fs.rmSync(uploadsSnapshotDir(m.name), { recursive: true, force: true });
  fs.rmSync(templatesSnapshotDir(m.name), { recursive: true, force: true });
}

/**
 * 滚动清理：先按保留期，再按「最多几份」与「总共占多少字节」两个上限。
 *
 * 只按时间删是不够的：份数由 BACKUP_INTERVAL_MS 决定（调成 1 小时就是 168 份），
 * 而每份都带一份完整 uploads 快照 —— 磁盘放大没有上界，写满之后业务写入开始报
 * SQLITE_FULL/ENOSPC，比备份失败严重得多。最新的一若干份永远保留，
 * 保证「刚出的问题至少有一份可回」。
 */
export function pruneBackups(
  retentionDays = 7,
  limits: { maxCount?: number; maxTotalBytes?: number } = {}
): number {
  // 注意别用 ?? 兜 env 数字：Number(undefined) 是 NaN 而不是 null，NaN 会让下面的比较永假
  const envCount = Number(process.env.BACKUP_MAX_COUNT);
  const maxCount = limits.maxCount ?? (Number.isFinite(envCount) && envCount > 0 ? envCount : 14);
  const envMb = Number(process.env.BACKUP_MAX_TOTAL_MB);
  const maxTotalBytes =
    (limits.maxTotalBytes ?? (Number.isFinite(envMb) && envMb > 0 ? envMb * 1024 * 1024 : 0)) || 0;
  const cutoff = retentionDays > 0 ? Date.now() - retentionDays * 86400000 : 0;
  const all = listBackups(); // 新 → 旧
  let removed = 0;
  let kept = 0;
  let keptBytes = 0;
  for (const m of all) {
    const age = new Date(m.createdAt).getTime();
    const tooOld = cutoff > 0 && age < cutoff;
    const overCount = kept >= maxCount;
    const overBytes = maxTotalBytes > 0 && kept > 0 && keptBytes + m.size > maxTotalBytes;
    if (!tooOld && !overCount && !overBytes) {
      kept++;
      keptBytes += m.size;
      continue;
    }
    try {
      removeBackupArtifacts(m);
      removed++;
    } catch (e) {
      // 删不掉就是要继续占空间的信号，吞掉等于让运维盲飞
      console.warn(`[backup] 清理旧备份 ${m.name} 失败：`, e);
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
  /** 导出脚本模板是否随备份一并回滚（模板住在数据卷里，同样只有快照存在才动） */
  templatesRestored: boolean;
  /** 恢复后补跑迁移的结果说明；失败时面板要提示"请重启服务" */
  schemaOk: boolean;
  schemaNote: string;
  /** 恢复后实际的日志模式（期望 wal；被别的连接挡住时会退回 delete 并在 schemaNote 里说清） */
  journalMode: string;
}

/**
 * 对文件跑一次 `PRAGMA integrity_check`。
 *
 * 三种结果必须分开：**损坏**（corrupt）与**没法验**（unchecked，例如只读连接开不起来）不是一回事。
 * 恢复前那道闸两种都拦（拦错了什么都不丢）；恢复后那道只能在**确认损坏**时才回滚 ——
 * 否则「校验器自己打不开文件」会把一份其实好端端的库又换回去，那比不校验更糟。
 */
export type IntegrityResult = { verdict: "ok" } | { verdict: "corrupt"; detail: string } | { verdict: "unchecked"; detail: string };

export function checkSqliteIntegrity(file: string): IntegrityResult {
  let conn: DatabaseSync | undefined;
  try {
    conn = new DatabaseSync(file, { readOnly: true });
    const rows = conn.prepare("PRAGMA integrity_check").all() as Array<Record<string, unknown>>;
    const messages = rows.map((r) => String(Object.values(r)[0] ?? ""));
    if (messages.length === 1 && messages[0].toLowerCase() === "ok") return { verdict: "ok" };
    return { verdict: "corrupt", detail: messages.join("; ").slice(0, 300) || "integrity_check 无输出" };
  } catch (e) {
    return { verdict: "unchecked", detail: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      conn?.close();
    } catch {
      /* 连接没开起来时 close 没有意义 */
    }
  }
}

export async function restoreBackup(name: string, safetyLabel = "pre-restore"): Promise<RestoreResult> {
  // 先解包再判断：zip 的"库文件"在归档里，落出来才谈得上 isSqliteFile / integrity_check。
  // opened.cleanup() 放在最外层 finally —— 下面任何一条 throw 都不能把临时树留在备份目录里。
  const opened = await openBackup(name);
  try {
    const src = opened.dbFile;
    if (!isSqliteFile(src)) throw new Error("无效的备份文件（不是 SQLite 数据库）");
    // 覆盖线上库之前的闸门：魔数检查（isSqliteFile）能挡住 txt/伪装文件，挡不住半份拷贝或被截断的库。
    const srcCheck = checkSqliteIntegrity(src);
    if (srcCheck.verdict !== "ok") {
      throw new Error(`备份文件校验未通过，线上库保持不变：${srcCheck.detail}`);
    }

    // 1) 先保留当前状态，万一恢复后想反悔还有退路
    let safetyBackup: string | undefined;
    try {
      safetyBackup = (await createBackup(safetyLabel)).name;
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

  // 3.5) 换上去的库必须自己站得住：磁盘/拷贝出问题时文件看着完整、读起来 corrupt。
  //      确认损坏就立刻用步骤 1 的安全备份换回去（此刻 uploads/模板还没动过，只需回滚库）；
  //      只是"验不了"则记下警告继续 —— 拿一个不确定的判断去毁掉一次成功的恢复不值得。
  const liveCheck = checkSqliteIntegrity(DB_PATH);
  if (liveCheck.verdict === "unchecked") {
    console.warn(`[backup] 恢复后无法校验库（${liveCheck.detail}），跳过校验继续`);
  }
  if (liveCheck.verdict === "corrupt") {
    // 回滚源是刚打的**安全备份**，它现在也是 zip —— 不能直接把文件拷回主库，
    // 必须先经 openBackup 解出里面的库。
    const rollbackFrom = async (): Promise<string> => {
      if (!safetyBackup) return "";
      const o = await openBackup(safetyBackup);
      try {
        const c = checkSqliteIntegrity(o.dbFile);
        if (c.verdict !== "ok") return c.verdict === "corrupt" ? `已损坏：${c.detail}` : `无法校验：${c.detail}`;
        closeDb();
        fs.copyFileSync(o.dbFile, DB_PATH);
        for (const ext of ["-wal", "-shm"]) fs.rmSync(DB_PATH + ext, { force: true });
        reloadDb();
        return "";
      } finally {
        o.cleanup();
      }
    };
    const safetyProblem = safetyBackup
      ? await rollbackFrom()
      : "恢复前的安全备份没有做成";
    if (safetyProblem) {
      throw new Error(
        `恢复后的库校验失败（${liveCheck.detail}），而且安全备份也不可用（${safetyProblem}）——请停服后从更早的备份手工替换 ${DB_PATH}`
      );
    }
    throw new Error(`恢复后的库校验失败（${liveCheck.detail}），已自动回滚到恢复前的安全备份 ${safetyBackup}`);
  }

  // 4) uploads / 模板快照回滚：与恢复前安全备份（步骤 1，同样带这两份快照）配对，
  //    即使拷贝中途失败也有退路。快照不存在的旧备份只恢复 DB，不擅自动文件。
  let uploadsRestored = false;
  if (opened.uploadsDir) {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.cpSync(opened.uploadsDir, UPLOADS_DIR, { recursive: true });
    uploadsRestored = true;
  }
  let templatesRestored = false;
  if (opened.templatesDir) {
    fs.rmSync(TEMPLATES_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    fs.cpSync(opened.templatesDir, TEMPLATES_DIR, { recursive: true });
    templatesRestored = true;
  }

  // 5) 补跑迁移与常驻维护：备份可能是老 schema，而唯一索引/新列（refKey、punch 唯一键、
  //    accounts.employeeId 索引…）只在启动路径上补。不补的话恢复完当下就开始 500：
  //    所有 `ON CONFLICT(employeeId,date,time)` 写入报 no such index，而用户只会觉得"恢复坏了"。
  let schemaNote = "已按当前版本补齐索引与列";
  let schemaOk = true;
  try {
    runMigrations();
  } catch (e) {
    schemaOk = false;
    schemaNote = `恢复后补跑迁移失败（${e instanceof Error ? e.message : String(e)}），请重启服务`;
    console.error("[backup] 恢复后补跑迁移失败：", e);
  }

  // 6) 确认还回 WAL：备份文件是 VACUUM INTO 出来的 delete 模式，journal_mode 的转换要求独占。
  //    只要有第二个连接（例如同时跑着的 dev:watch 共用同一个库）就会静默留在 delete 模式 ——
  //    那种状态下并发写会各自等满 busy_timeout 再报 database is locked，比"恢复失败"更难查。
  const journalMode = String(db.prepare("PRAGMA journal_mode").get()?.journal_mode ?? "").toLowerCase();
  if (journalMode !== "wal") {
    schemaOk = false;
    schemaNote =
      schemaNote +
      `；恢复后日志模式是 ${journalMode || "未知"}（不是 wal）。若另有进程占着同一个库（例如 :3000 的开发实例），` +
      `请先停掉它再恢复一次，否则并发写会等 5 秒后报 database is locked`;
    console.warn(`[backup] ${schemaNote}`);
  }

  return { restoredFrom: name, safetyBackup, uploadsRestored, templatesRestored, schemaOk, schemaNote, journalMode };
  } finally {
    // zip 解出来的临时树必须走这里被带走；上面任何一条 throw 都不例外
    opened.cleanup();
  }
}

/**
 * 删除单份备份（只删备份产物，不碰线上库）。返回是否删掉了东西。
 * 名字里的 format 只用来决定要不要顺带清 legacy 的 sidecar 目录，所以按扩展名判即可。
 */
export function deleteBackup(name: string): boolean {
  const p = resolveBackupPath(name);
  if (!fs.existsSync(p)) return false;
  removeBackupArtifacts({ name, path: p, size: 0, createdAt: "", format: p.endsWith(".zip") ? "zip" : "legacy" });
  return true;
}

/**
 * 把一份外部送来的备份收进备份目录（**只入库，不恢复**）。
 *
 * 这是"界面导入"的服务端一侧：用户在面板选一个文件，它落到 `data/backups/` 里成为一行，
 * 之后要不要恢复仍由那个已有的「恢复」按钮决定 —— 导入和恢复分开，才有反悔的余地。
 *
 * 进来的是别的机器产生的字节，所以全部校验都在改名入库**之前**做完：
 * 文件头判格式 → zip 走解包防线（条目白名单 + 越界路径 + 容量上限）→ 库跑 integrity_check。
 * 任何一步失败都只销毁暂存文件，备份目录里不会多出半份"看着像备份"的东西。
 *
 * `originalName` 是客户端给的显示名，只当素材用：取 basename、去扩展名、过滤到
 * `[A-Za-z0-9_-]`，绝不当路径拼。
 */
export async function importBackup(stagedPath: string, originalName: string): Promise<BackupMeta> {
  try {
    return await landImportedBackup(stagedPath, originalName);
  } catch (e) {
    // 不变量收在这里：**任何**失败路径都不留暂存文件。散在各条 throw 前删容易漏
    // （空文件、认不出格式、容量不足这三条就漏过），改名入库成功后 stagedPath 已不存在，
    // 这里的 rm 是 force 的空操作，不会误删正式备份。
    fs.rmSync(stagedPath, { force: true });
    throw e;
  }
}

async function landImportedBackup(stagedPath: string, originalName: string): Promise<BackupMeta> {
  const dir = backupDir();
  if (!fs.existsSync(stagedPath)) throw new Error("上传的备份没落到磁盘上");
  const size = fs.statSync(stagedPath).size;
  if (size === 0) throw new Error("备份文件是空的");

  const free = freeBytesAt(dir);
  if (free !== null && free < size * 2) {
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    throw new BackupCapacityError(`磁盘剩余不足：这份备份 ${mb(size)} MB，只剩 ${mb(free)} MB，请先清理旧备份`);
  }

  const isArchive = isZipFile(stagedPath);
  if (!isArchive && !isSqliteFile(stagedPath)) {
    throw new Error("无法识别的备份文件：既不是 zip 归档，也不是 SQLite 数据库");
  }

  const base = path.basename(originalName).replace(/\.(zip|db)$/i, "");
  // 文件名本身就是一枚自动生成的备份名（ams-2026…）时不再拿来当 label：
  // 否则导入一次就得到 `ams-<新戳>.ams-<旧戳>.zip`，看着像出了错。
  // 人肉改过名的（"上线前备份.zip"）保留，那才是有用的出处信息。
  const label = /^ams-\d{8}/.test(base) ? "" : base.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);

  const name = nextBackupName(label || undefined, isArchive ? "zip" : "db");
  const target = path.join(dir, name);

  if (isArchive) {
    // 解到临时目录验一遍库；extractArchiveZip 自己会在失败时清干净临时树
    const into = path.join(dir, `._validate-${process.pid}-${Date.now()}`);
    const got = await extractArchiveZip(stagedPath, into);
    try {
      if (!isSqliteFile(got.dbFile)) throw new Error("归档里的 database.sqlite 不是 SQLite 数据库");
      const c = checkSqliteIntegrity(got.dbFile);
      if (c.verdict !== "ok") throw new Error(`归档里的库校验未通过：${c.detail}`);
    } finally {
      got.cleanup();
    }
  } else {
    const c = checkSqliteIntegrity(stagedPath);
    if (c.verdict !== "ok") throw new Error(`导入失败：这份库校验不通过（${c.detail}）`);
  }

  // 暂存文件与目标同目录，rename 是原子的：不会出现"半个备份已经在列表里"
  fs.renameSync(stagedPath, target);

  console.log(`[backup] 已导入备份 ${name}（来自 ${path.basename(originalName)}，${Math.round(size / 1024)} KB）`);
  return {
    name,
    path: target,
    size: fs.statSync(target).size,
    createdAt: new Date().toISOString(),
    format: isArchive ? "zip" : "legacy",
    withUploads: isArchive ? undefined : false,
  };
}

export interface BackupConfig {
  enabled: boolean;
  retentionDays: number;
  intervalMs: number;
  backupDir: string;
  count: number;
  /** 份数上限（超出即从最旧开始删） */
  maxCount: number;
  /** 总占用上限（MB）；0 = 不按容量清理 */
  maxTotalMb: number;
  /** 备份目录所在卷的剩余空间（MB）；文件系统量不到时为 null */
  freeMb: number | null;
  /** 最近一次备份结果（含定时与手动），从未跑过时为 null */
  lastRun: BackupRun | null;
}

/** 当前备份配置（供前端展示） */
export function getBackupConfig(): BackupConfig {
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || 7;
  const intervalMs = Number(process.env.BACKUP_INTERVAL_MS) || 86400000;
  const enabled = process.env.BACKUP_ENABLED !== "false";
  const envCount = Number(process.env.BACKUP_MAX_COUNT);
  const envMb = Number(process.env.BACKUP_MAX_TOTAL_MB);
  const dir = backupDir();
  const free = freeBytesAt(dir);
  return {
    enabled,
    retentionDays,
    intervalMs,
    backupDir: dir,
    count: listBackups().length,
    maxCount: Number.isFinite(envCount) && envCount > 0 ? envCount : 14,
    maxTotalMb: Number.isFinite(envMb) && envMb > 0 ? envMb : 0,
    freeMb: free === null ? null : Math.round(free / 1024 / 1024),
    lastRun,
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
    pruneBackups(cfg.retentionDays, { maxCount: cfg.maxCount, maxTotalBytes: cfg.maxTotalMb * 1024 * 1024 });
  } catch (e) {
    console.error("[backup] 启动时清理旧备份失败：", e);
  }
  const timer = setInterval(() => {
    // createBackup 现在是异步的（要流式写 zip）。定时器回调里不能 await，
    // 也不能让它有机会变成 unhandledRejection —— 那会撞上全站兜底 process.exit(1)。
    void (async () => {
      try {
        await createBackup();
        pruneBackups(cfg.retentionDays, { maxCount: cfg.maxCount, maxTotalBytes: cfg.maxTotalMb * 1024 * 1024 });
      } catch (e) {
        // 磁盘满与 SQL 错误是两类问题，运维要能在日志里分辨出来
        console.error(
          e instanceof BackupCapacityError
            ? `[backup] ${e.message}（自动备份将在下次调度重试）`
            : "[backup] 定时备份失败：",
          e instanceof BackupCapacityError ? undefined : e
        );
      }
    })();
  }, cfg.intervalMs);
  // 不让定时器阻止进程退出（仅服务器长期运行需要）
  if (typeof timer.unref === "function") timer.unref();
  console.log(
    `[backup] 自动备份已启动：每 ${Math.round(cfg.intervalMs / 60000)} 分钟一次，` +
      `保留 ${cfg.retentionDays} 天 / 最多 ${cfg.maxCount} 份${cfg.maxTotalMb ? ` / 总量 ≤ ${cfg.maxTotalMb}MB` : ""}`
  );
  return timer;
}
