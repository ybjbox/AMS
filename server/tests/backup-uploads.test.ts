/**
 * 备份/恢复的两代形态回归。
 *
 * 覆盖三件事，顺序按风险排：
 *  1. 新格式（单文件 zip）里 uploads / 模板快照真的在归档内，恢复能把它们带回磁盘；
 *  2. **老格式（ams-x.db + sidecar 目录）必须继续可恢复** —— 线上备份目录里躺着几十份
 *     历史产物，读侧一旦不认，"出事就退回上周"这句话当场失效；
 *  3. 恢复完的库要自己站得住：迁移补齐、WAL 回来（这两条历来是恢复之后才暴雷的地方）。
 *
 * 为什么自带临时 DATA_DIR：本 project 的 fork 在多个测试文件间复用，restoreBackup
 * 会替换 .db 文件本体，Windows 下其他文件残留的连接句柄会让原子 rename 报 EPERM。
 * 独立数据目录（与 scripts/verify-*.ts 同套路）让恢复只面对自己的连接。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-backup-test-"));
process.env.DATA_DIR = DATA_DIR;

const { runMigrations } = await import("../migrate.ts");
const { UPLOADS_DIR } = await import("../documentsDb.ts");
const { TEMPLATES_DIR } = await import("../templateStore.ts");
const { createBackup, restoreBackup, deleteBackup, backupDir, openBackup, listBackups } =
  await import("../backupDb.ts");
const { closeDb } = await import("../db.ts");

function put(name: string, content: string): string {
  const p = path.join(UPLOADS_DIR, name);
  fs.writeFileSync(p, content);
  return p;
}

/** 把一份备份解出来读单个文件，用来断言"归档里确实带着它" */
async function readFromBackup(backupName: string, rel: string): Promise<string | null> {
  const o = await openBackup(backupName);
  try {
    if (!o.uploadsDir) return null;
    const p = path.join(o.uploadsDir, ...rel.split("/"));
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
  } finally {
    o.cleanup();
  }
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  // Windows 不允许删除仍被打开的文件：先关连接再清临时目录
  closeDb();
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    console.warn(`[test] 临时数据目录需手动清理：${DATA_DIR}`);
  }
});

describe("新格式：单文件 zip 归档", () => {
  it("产出的是一行 .zip，库里带着 uploads 与模板", async () => {
    put("bkp-a.txt", "doc-A");
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEMPLATES_DIR, "tpl-a.txt"), "模板-A");

    const meta = await createBackup("ziptest");
    expect(meta.name.endsWith(".zip")).toBe(true);
    expect(meta.format).toBe("zip");
    expect(fs.existsSync(meta.path)).toBe(true);
    // zip 不再用 withUploads 这个布尔表达"整套都带着"
    expect(meta.withUploads).toBeUndefined();

    expect(await readFromBackup(meta.name, "bkp-a.txt")).toBe("doc-A");

    const o = await openBackup(meta.name);
    try {
      expect(o.templatesDir && fs.existsSync(path.join(o.templatesDir, "tpl-a.txt"))).toBe(true);
      expect(o.manifest?.version).toBe(3);
      expect(o.manifest?.withUploads).toBe(true);
    } finally {
      o.cleanup();
    }
    fs.rmSync(path.join(UPLOADS_DIR, "bkp-a.txt"), { force: true });
    deleteBackup(meta.name);
  });

  it("解包临时目录用完即走，备份目录里不堆残骸", async () => {
    const meta = await createBackup("clean");
    const before = fs.readdirSync(backupDir()).length;
    await openBackup(meta.name).then((o) => o.cleanup());
    expect(fs.readdirSync(backupDir()).length).toBe(before);
    deleteBackup(meta.name);
  });
});

describe("恢复一并回滚 uploads / 模板", () => {
  it("快照里的文件回来、快照之后的新文件消失，安全备份也可逆", async () => {
    const original = put("bkp-b.txt", "doc-B");
    const backup = await createBackup("pair");

    // 备份之后：原文件被删、来了个新文件——恢复应双双翻转
    fs.rmSync(original);
    const extra = put("bkp-c.txt", "doc-C-after-backup");
    expect(fs.existsSync(original)).toBe(false);

    const result = await restoreBackup(backup.name);
    expect(result.uploadsRestored).toBe(true);
    expect(fs.readFileSync(original, "utf-8")).toBe("doc-B"); // 回来的文件内容一致
    expect(fs.existsSync(extra)).toBe(false); // 快照之后的文件被回滚掉

    // pre-restore 安全备份（同样是 zip）里应当带着当时还存在的 doc-C
    expect(await readFromBackup(result.safetyBackup!, "bkp-c.txt")).toBe("doc-C-after-backup");
  });

  it("没有 uploads 快照的备份只恢复 DB，不擅自动磁盘文件", async () => {
    // 真正的"无快照"用 legacy 单文件形态来造：把一份归档里的库抽出来当 .db 备份
    const src = await createBackup("donor");
    const donor = await openBackup(src.name);
    const legacyName = "ams-legacy-nodb.zip-free.db";
    try {
      fs.copyFileSync(donor.dbFile, path.join(backupDir(), legacyName));
    } finally {
      donor.cleanup();
    }
    deleteBackup(src.name);

    const survivor = put("bkp-d.txt", "keep-me");
    const result = await restoreBackup(legacyName);
    expect(result.uploadsRestored).toBe(false);
    expect(result.templatesRestored).toBe(false);
    expect(fs.readFileSync(survivor, "utf-8")).toBe("keep-me");
    fs.rmSync(survivor, { force: true });
    deleteBackup(legacyName);
  });
});

describe("遗留三件套继续可读", () => {
  /** 手工搭一份 v2 形态：ams-x.db + ams-x.db.uploads/ + ams-x.db.templates/ */
  async function makeLegacyTriple(label: string): Promise<string> {
    const meta = await createBackup(label);
    const opened = await openBackup(meta.name);
    const legacyName = meta.name.replace(/\.zip$/, ".db");
    try {
      fs.copyFileSync(opened.dbFile, path.join(backupDir(), legacyName));
      const up = path.join(backupDir(), `${legacyName}.uploads`);
      fs.mkdirSync(up, { recursive: true });
      fs.writeFileSync(path.join(up, "old.txt"), "老快照里的文件");
      const tp = path.join(backupDir(), `${legacyName}.templates`);
      fs.mkdirSync(tp, { recursive: true });
      fs.writeFileSync(path.join(tp, "old.tpl"), "老模板");
    } finally {
      opened.cleanup();
    }
    deleteBackup(meta.name);
    return legacyName;
  }

  it("openBackup 认得 sidecar，列表里 format=legacy 且 withUploads=true", async () => {
    const name = await makeLegacyTriple("legacy-read");
    const o = await openBackup(name);
    try {
      expect(o.format).toBe("legacy");
      expect(o.dbFile).toBe(path.join(backupDir(), name));
      expect(o.uploadsDir && fs.existsSync(path.join(o.uploadsDir, "old.txt"))).toBe(true);
      expect(o.templatesDir && fs.existsSync(path.join(o.templatesDir, "old.tpl"))).toBe(true);
      expect(o.manifest).toBeNull(); // 老形态没有 manifest，读侧不能假装它有
    } finally {
      o.cleanup(); // legacy 没有临时树，cleanup 应当是空操作
    }
    expect(fs.existsSync(path.join(backupDir(), name))).toBe(true);

    const row = listBackups().find((b) => b.name === name);
    expect(row?.format).toBe("legacy");
    expect(row?.withUploads).toBe(true);
    deleteBackup(name);
  });

  it("从 legacy 三件套恢复：库换掉、uploads 与模板一并回来", async () => {
    const name = await makeLegacyTriple("legacy-restore");
    const result = await restoreBackup(name);
    expect(result.uploadsRestored).toBe(true);
    expect(result.templatesRestored).toBe(true);
    expect(fs.readFileSync(path.join(UPLOADS_DIR, "old.txt"), "utf-8")).toBe("老快照里的文件");
    deleteBackup(name);
  });

  it("删除 legacy 备份时 .db 与两个 sidecar 目录一起消失", async () => {
    const name = await makeLegacyTriple("legacy-delete");
    const dir = backupDir();
    expect(deleteBackup(name)).toBe(true);
    expect(fs.existsSync(path.join(dir, name))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${name}.uploads`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${name}.templates`))).toBe(false);
  });
});

describe("deleteBackup 对新格式", () => {
  it("删除 zip 备份后文件消失，列表里不再有它", async () => {
    const backup = await createBackup("del-zip");
    expect(fs.existsSync(backup.path)).toBe(true);
    expect(deleteBackup(backup.name)).toBe(true);
    expect(fs.existsSync(backup.path)).toBe(false);
    expect(listBackups().some((b) => b.name === backup.name)).toBe(false);
  });
});

describe("恢复后补跑迁移（全系统检查 A3）", () => {
  it("老备份缺唯一索引：恢复完就该在库里补齐，且返回 schemaOk", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const INDEX = "idx_punch_employee_date_time";
    const meta = await createBackup("mgtest");

    // 造一份"v11 之前"的备份：把索引从归档里的库抽出来删掉，再用 legacy 形态放回去
    const opened = await openBackup(meta.name);
    const oldName = meta.name.replace(/\.zip$/, ".db");
    try {
      fs.copyFileSync(opened.dbFile, path.join(backupDir(), oldName));
    } finally {
      opened.cleanup();
    }
    deleteBackup(meta.name);

    const old = new DatabaseSync(path.join(backupDir(), oldName));
    old.exec(`DROP INDEX IF EXISTS ${INDEX}`);
    expect(old.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(INDEX)).toBeUndefined();
    old.close();

    const res = await restoreBackup(oldName);
    expect(res.schemaOk).toBe(true);
    expect(res.schemaNote).toContain("补齐");
    // 线上库（恢复后的那个文件）必须重新有这个索引，否则所有 ON CONFLICT 写入会 500
    // 注意要在使用 restoreBackup 之后再取 db：reloadDb 会换掉连接，早取的句柄已关闭
    const { db } = await import("../db.ts");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(INDEX)).toBeTruthy();
    deleteBackup(oldName);
  });
});

describe("恢复后必须是 WAL（第二个连接的教训）", () => {
  it("restoreBackup 报告 journalMode，且单连接环境下确实是 wal", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const probe = new DatabaseSync(path.join(DATA_DIR, "ams.db"), { readOnly: true });
    const before = String(probe.prepare("PRAGMA journal_mode").get()?.journal_mode ?? "").toLowerCase();
    probe.close();
    expect(before).toBe("wal"); // 本套用例自带独立 DATA_DIR，没有第二个实例抢锁

    const meta = await createBackup("walcheck");
    const res = await restoreBackup(meta.name);
    expect(res.journalMode).toBe("wal");
    expect(res.schemaOk).toBe(true);
    deleteBackup(meta.name);
  });
});
