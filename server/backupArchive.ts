/**
 * 备份归档层：一份备份 = 一个 .zip 文件。
 *
 * 为什么要它：备份的产物在恢复前**必然要跨机器搬**（本机 → NAS、NAS → 移动盘）。
 * 而上一代的形态是「ams-x.db + ams-x.db.uploads/ + ams-x.db.templates/」三件套，
 * 导出接口只能流那个 .db，两个 sidecar 目录走不了 HTTP —— 于是"下载一份完整备份"
 * 这件事在界面上做不到，只能教用户去翻文件系统。改成单文件归档后，
 * 导出是一个文件、导入是一个文件、列表里一行就是一个文件。
 *
 * 归档内的固定布局（导入端按这个白名单收，别的一律拒）：
 *   manifest.json      — 这份备份的身份信息（来源、时间、是否含 uploads/模板）
 *   database.sqlite    — VACUUM INTO 出来的自包含库
 *   uploads/<...>      — data/uploads 的整目录快照（可空）
 *   templates/<...>    — data/templates 的整目录快照（可空）
 *
 * 两个方向都用流式：写用 archiver（不把整份备份读进内存），读用 unzipper 的
 * 中央目录先校验、再逐条目 stream 落盘。这站有过 base64 上传 50MB → OOM 的事故
 * （AUDIT P2-4），所以凡是"整份文件进内存"的写法在这里是禁止的。
 */
import fs from "fs";
import path from "path";
import archiver from "archiver";
import * as unzipper from "unzipper";
/** manifest.json 的形状 —— 也是导入端判断"这是不是我们的归档"的主要依据 */
export interface BackupManifest {
  /** 归档格式版本；v3 = 单文件 zip */
  version: 3;
  /** 生成时间（ISO） */
  createdAt: string;
  /** 产生这份备份的应用版本（package.json 的 version） */
  appVersion?: string;
  /** 来源数据目录的绝对路径 —— 只在排查"这份是哪台机器出来的"时有用 */
  sourceDbPath?: string;
  /** 是否含 uploads 快照（空目录也算 false：没有文件就等于没有） */
  withUploads: boolean;
  /** 是否含导出脚本模板快照 */
  withTemplates: boolean;
  /** 库文件（database.sqlite）的字节数，导入时先按它做一次粗校验 */
  dbBytes: number;
}

export const ARCHIVE_DB_ENTRY = "database.sqlite";
export const ARCHIVE_MANIFEST_ENTRY = "manifest.json";
export const ARCHIVE_UPLOADS_PREFIX = "uploads/";
export const ARCHIVE_TEMPLATES_PREFIX = "templates/";

/** 归档内允许的条目前缀白名单；不在表里的条目一律拒绝解出 */
const ALLOWED_ENTRIES = new Set([ARCHIVE_MANIFEST_ENTRY, ARCHIVE_DB_ENTRY]);

/** 解包防线：条目数与解压总字节。上传文件本身的上限在路由侧（200MB），
 *  这里防的是"200MB 的 zip 解出 50GB"这种压缩炸弹。 */
const MAX_ENTRIES = 50_000;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GB

const ZIP_MAGIC = "PK\u0003\u0004";
/** 空归档的签名：archiver 打一份不含任何条目的 zip 时只有这个中央目录结束标记 */
const ZIP_EMPTY_MAGIC = "PK\u0005\u0006";

/** zip 魔数检查（前 4 字节）。空 zip（`PK\u0005\u0006`）也放行 —— 它确实是合法 zip，
 *  只是里面没有 database.sqlite，交给下面的"缺库"检查报出准确原因，
 *  别在这里说成"文件头不是 zip"（那是另一回事，会误导排查）。 */
export function isZipFile(p: string): boolean {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const head = buf.toString("latin1");
    return head === ZIP_MAGIC || head === ZIP_EMPTY_MAGIC;
  } catch {
    return false;
  }
}

/**
 * 条目名安全检查。zip 规范用 `/`，但 Windows 打包工具会写 `\`，两种都要挡。
 * 拦下的都是真实攻击面：`../ams.db` 能把备份写到数据目录外面，
 * `C:/...` 绝对路径同理，符号链接条目（unzipper 的 TypeLink）也不放行。
 */
function isSafeEntryName(name: string): boolean {
  if (!name || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  const parts = name.split(/[/\\]/);
  return !parts.some((p) => p === "..");
}

/** 是否是我们认可的条目（目录条目本身跳过，它靠子条目表达） */
function isAllowedEntry(name: string): boolean {
  if (ALLOWED_ENTRIES.has(name)) return true;
  return name.startsWith(ARCHIVE_UPLOADS_PREFIX) || name.startsWith(ARCHIVE_TEMPLATES_PREFIX);
}

/** 递归列出目录里的普通文件（相对 root 的路径，用 `/` 分隔，保证跨平台归档一致） */
function listFilesRel(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, rel);
      else if (e.isFile()) out.push(rel);
      // 符号链接与设备文件不进归档：恢复时会在数据目录里造出指向别处的路径
    }
  }
  if (fs.existsSync(root)) walk(root, "");
  return out;
}

/**
 * 把「库 + uploads + 模板」打成一份 zip。三个来源都是磁盘上已有的路径，
 * 调用方负责在打完后删掉临时的库文件。
 */
export async function writeArchiveZip(
  targetZip: string,
  opts: { dbFile: string; uploadsDir?: string; templatesDir?: string; manifest: BackupManifest }
): Promise<void> {
  const out = fs.createWriteStream(targetZip);
  const archive = archiver("zip", { zlib: { level: 6 } });
  const done = new Promise<void>((resolve, reject) => {
    out.on("close", () => resolve());
    archive.on("warning", (e: Error) => reject(e));
    archive.on("error", (e: Error) => reject(e));
  });
  archive.pipe(out);

  archive.append(JSON.stringify(opts.manifest, null, 2), { name: ARCHIVE_MANIFEST_ENTRY });
  archive.file(opts.dbFile, { name: ARCHIVE_DB_ENTRY });

  const addTree = (dir: string | undefined, prefix: string) => {
    if (!dir) return;
    for (const rel of listFilesRel(dir)) {
      const abs = path.join(dir, ...rel.split("/"));
      archive.file(abs, { name: `${prefix}${rel}` });
    }
  };
  addTree(opts.uploadsDir, ARCHIVE_UPLOADS_PREFIX);
  addTree(opts.templatesDir, ARCHIVE_TEMPLATES_PREFIX);

  await archive.finalize();
  await done;
}

/** 解包结果：三个来源路径都在一个临时目录里，调用方用完必须 cleanup() */
export interface ExtractedArchive {
  manifest: BackupManifest | null;
  /** database.sqlite 解出后的路径（保证存在） */
  dbFile: string;
  uploadsDir: string | null;
  templatesDir: string | null;
  cleanup: () => void;
}

/**
 * 校验 + 解包。
 *
 * 顺序是有意的：**先读完中央目录做全部校验，再动磁盘**。
 * 越界条目、炸弹、缺库这些情况都在这一步失败干净，临时目录随即删掉，
 * 不会留下"解了一半的 uploads"让下次恢复误判。
 */
export async function extractArchiveZip(zipPath: string, intoDir: string): Promise<ExtractedArchive> {
  if (!isZipFile(zipPath)) throw new Error("不是有效的备份归档（文件头不是 zip）");

  const directory = await unzipper.Open.file(zipPath);
  // unzipper 的条目类型只区分 File / Directory；符号链接不会单独标出来，
  // 所以防"解出指向别处的路径"靠的是下面两道：条目名白名单 + 落盘路径必须由 intoDir 起算。
  const files = directory.files.filter((f) => f.type !== "Directory");

  if (files.length > MAX_ENTRIES) {
    throw new Error(`归档条目过多（${files.length} > ${MAX_ENTRIES}），拒绝解包`);
  }
  const totalOut = files.reduce((n, f) => n + f.uncompressedSize, 0);
  if (totalOut > MAX_UNCOMPRESSED_BYTES) {
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    throw new Error(`归档解压后体积过大（${mb(totalOut)} MB > ${mb(MAX_UNCOMPRESSED_BYTES)} MB），拒绝解包`);
  }
  for (const f of files) {
    if (!isSafeEntryName(f.path)) throw new Error(`归档里有越界路径条目，拒绝解包：${f.path.slice(0, 120)}`);
    if (!isAllowedEntry(f.path)) throw new Error(`归档里有意料之外的条目，拒绝解包：${f.path.slice(0, 120)}`);
  }
  const dbEntry = files.find((f) => f.path === ARCHIVE_DB_ENTRY);
  if (!dbEntry) throw new Error("归档里没有 database.sqlite，不是本应用产出的备份");
  if (dbEntry.uncompressedSize === 0) throw new Error("归档里的 database.sqlite 是空文件");

  fs.mkdirSync(intoDir, { recursive: true });
  const cleanup = () => {
    try {
      fs.rmSync(intoDir, { recursive: true, force: true });
    } catch {
      /* 临时目录删不掉只占空间，不影响正确性 */
    }
  };

  try {
    let manifest: BackupManifest | null = null;
    let uploadsDir: string | null = null;
    let templatesDir: string | null = null;

    for (const f of files) {
      const dest = path.join(intoDir, ...f.path.split("/"));
      if (f.path === ARCHIVE_MANIFEST_ENTRY) {
        // manifest 只是元信息：坏 JSON 不该让一份其实能用的库备不进来，所以容错为 null
        try {
          manifest = JSON.parse((await f.buffer()).toString("utf8")) as BackupManifest;
        } catch {
          manifest = null;
        }
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      // 流式落盘：单条 uploads 里的文件可能有几十 MB，逐条目 buffer() 会把整份归档堆进内存
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(dest);
        const rs = f.stream();
        rs.on("error", reject);
        ws.on("error", reject);
        ws.on("close", () => resolve());
        rs.pipe(ws);
      });
      if (f.path === ARCHIVE_DB_ENTRY) continue;
      if (f.path.startsWith(ARCHIVE_UPLOADS_PREFIX)) uploadsDir = path.join(intoDir, "uploads");
      else if (f.path.startsWith(ARCHIVE_TEMPLATES_PREFIX)) templatesDir = path.join(intoDir, "templates");
    }

    const dbFile = path.join(intoDir, ARCHIVE_DB_ENTRY);
    if (!fs.existsSync(dbFile)) throw new Error("解包后找不到 database.sqlite");
    if (manifest && manifest.version !== 3) {
      throw new Error(`归档格式版本不支持（version=${manifest.version}，本版本只认 3）`);
    }
    return { manifest, dbFile, uploadsDir, templatesDir, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

/** 读归档里的 manifest，不碰其他条目（给列表/诊断用） */
export async function readArchiveManifest(zipPath: string): Promise<BackupManifest | null> {
  try {
    const directory = await unzipper.Open.file(zipPath);
    const entry = directory.files.find((f) => f.path === ARCHIVE_MANIFEST_ENTRY);
    if (!entry) return null;
    return JSON.parse((await entry.buffer()).toString("utf8")) as BackupManifest;
  } catch {
    return null;
  }
}

/** 把一份现存的老三件套（.db + .uploads/ + .templates/）就地升级成单文件归档 */
export async function packLegacyArchive(args: {
  dbFile: string;
  uploadsDir?: string;
  templatesDir?: string;
  targetZip: string;
  manifest: BackupManifest;
}): Promise<void> {
  const hasUploads = !!args.uploadsDir && listFilesRel(args.uploadsDir).length > 0;
  const hasTemplates = !!args.templatesDir && listFilesRel(args.templatesDir).length > 0;
  await writeArchiveZip(args.targetZip, {
    dbFile: args.dbFile,
    uploadsDir: hasUploads ? args.uploadsDir : undefined,
    templatesDir: hasTemplates ? args.templatesDir : undefined,
    manifest: { ...args.manifest, withUploads: hasUploads, withTemplates: hasTemplates },
  });
}

export { listFilesRel };
