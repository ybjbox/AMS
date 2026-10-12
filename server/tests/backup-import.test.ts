/**
 * 导入外部备份的回归（`importBackup`）。
 *
 * 这条接口收的是**别的机器送上来的字节**，而且它产出的东西下一步会被「恢复」覆盖到线上库，
 * 所以断言的重心不在"能不能导入"，而在：不该入库的东西一律不入库、且失败后备份目录里
 * 不留下任何半份伪装成备份的文件。用户名的处理也在这里钉住：`originalName` 只是显示素材。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-import-test-"));
process.env.DATA_DIR = DATA_DIR;

const { runMigrations } = await import("../migrate.ts");
const { UPLOADS_DIR } = await import("../documentsDb.ts");
const backup = await import("../backupDb.ts");
const { createBackup, restoreBackup, importBackup, listBackups, backupDir, openBackup } = backup;
const { closeDb } = await import("../db.ts");

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  closeDb();
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    console.warn(`[test] 临时数据目录需手动清理：${DATA_DIR}`);
  }
});

/** 暂存成一个随机文件（模拟路由已经把它落盘），返回路径。
 *  名字与线上路由一致以 `.part` 结尾：半截上传不该出现在备份列表里。 */
function stage(label: string, content: Buffer | string): string {
  const p = path.join(backupDir(), `._import-${label}.part`);
  fs.writeFileSync(p, content);
  return p;
}

/** 现场打一个 zip（可指定条目名，用来造恶意归档） */
async function buildZip(target: string, entries: Array<[name: string, content: Buffer | string]>): Promise<string> {
  const out = fs.createWriteStream(target);
  const archive = archiver("zip");
  const closed = new Promise<void>((resolve, reject) => {
    out.on("close", () => resolve());
    archive.on("error", reject);
  });
  archive.pipe(out);
  for (const [name, content] of entries) archive.append(content as string, { name });
  await archive.finalize();
  await closed;
  return target;
}

/** 用真实备份当"合法库"素材：VACUUM INTO 一份，取出归档里的 database.sqlite */
async function realSqliteBytes(): Promise<Buffer> {
  const meta = await createBackup("donor-for-import");
  const opened = await openBackup(meta.name);
  try {
    return fs.readFileSync(opened.dbFile);
  } finally {
    opened.cleanup();
    backup.deleteBackup(meta.name);
  }
}

describe("正路：导入后能出现在列表里、也能恢复", () => {
  it("导入 zip 归档 → 列表多一行 zip → 从它恢复", async () => {
    // 先造一份"别的机器"产出的备份：本机备份 → 取出 zip 当上传件
    await putEmployee("IMP01", "待导入的人");
    const mine = await createBackup("origin");
    const uploaded = stage("good.zip", fs.readFileSync(mine.path));
    // 半截上传阶段的暂存文件绝不能混进备份列表（它就是一个 .zip 躺在备份目录里）
    expect(listBackups().some((b) => b.name.startsWith("._import-"))).toBe(false);
    backup.deleteBackup(mine.name);
    // 线上先抹掉这行，用来验证恢复真的把内容带回来了
    (await liveDb()).prepare("DELETE FROM employees WHERE id = ?").run("IMP01");
    expect(await row("IMP01")).toBeUndefined();

    const imported = await importBackup(uploaded, "origin.zip");
    expect(imported.format).toBe("zip");
    expect(imported.name.endsWith(".zip")).toBe(true);
    expect(fs.existsSync(imported.path)).toBe(true);
    expect(listBackups().some((b) => b.name === imported.name)).toBe(true);

    const res = await restoreBackup(imported.name);
    expect(res.restoredFrom).toBe(imported.name);
    expect((await row("IMP01"))?.name).toBe("待导入的人");

    (await liveDb()).prepare("DELETE FROM employees WHERE id = ?").run("IMP01");
    backup.deleteBackup(imported.name);
  });

  it("导入外来 zip 会带上它的 uploads 快照", async () => {
    const marker = path.join(UPLOADS_DIR, "import-marker.txt");
    fs.writeFileSync(marker, "来自另一台机器的文件");
    const mine = await createBackup("with-uploads");
    fs.rmSync(marker, { force: true });
    const uploaded = stage("uploads.zip", fs.readFileSync(mine.path));
    backup.deleteBackup(mine.name);

    const imported = await importBackup(uploaded, "uploads.zip");
    const res = await restoreBackup(imported.name);
    expect(res.uploadsRestored).toBe(true);
    expect(fs.readFileSync(path.join(UPLOADS_DIR, "import-marker.txt"), "utf-8")).toBe("来自另一台机器的文件");
    fs.rmSync(path.join(UPLOADS_DIR, "import-marker.txt"), { force: true });
    backup.deleteBackup(imported.name);
  });

  it("只含库的老式 .db 也收：format=legacy、没有文件快照", async () => {
    const sqlite = await realSqliteBytes();
    const staged = stage("legacy.db", sqlite);
    const imported = await importBackup(staged, "老机器上的备份.db");
    expect(imported.format).toBe("legacy");
    expect(imported.withUploads).toBe(false);
    const res = await restoreBackup(imported.name);
    expect(res.uploadsRestored).toBe(false);
    expect(res.schemaOk).toBe(true);
    backup.deleteBackup(imported.name);
  });

  it("入库名由服务端生成，客户端给的文件名只当素材", async () => {
    const sqlite = await realSqliteBytes();
    // 客户端递来一个带路径的恶意名字：既不能穿越目录，也不能原样落盘
    const staged = stage("escape.db", sqlite);
    const imported = await importBackup(staged, "../../../../etc/passwd.db");
    expect(imported.name.startsWith("ams-")).toBe(true);
    expect(/[\\/.]{2}/.test(imported.name)).toBe(false);
    expect(path.dirname(imported.path)).toBe(backupDir());
    backup.deleteBackup(imported.name);
  });
});

describe("拒绝面：不该入库的一律不入库，且不留残骸", () => {
  function expectNoStagingLeft() {
    const leftovers = fs.readdirSync(backupDir()).filter((f) => f.startsWith("._import-") || f.startsWith("._validate-"));
    expect(leftovers).toEqual([]);
  }

  it("文本文件冒充备份：认不出格式，拒", async () => {
    const before = listBackups().length;
    const staged = stage("fake.db", "这只是一段文本，不是数据库");
    await expect(importBackup(staged, "fake.db")).rejects.toThrow(/无法识别的备份文件/);
    expect(listBackups().length).toBe(before);
    expect(fs.existsSync(staged)).toBe(false);
    expectNoStagingLeft();
  });

  it("空文件：拒", async () => {
    const staged = stage("empty.zip", Buffer.alloc(0));
    await expect(importBackup(staged, "empty.zip")).rejects.toThrow(/是空的/);
    expect(fs.existsSync(staged)).toBe(false);
  });

  it("zip 里的库是截断过的：integrity_check 拦住，不入库", async () => {
    const sqlite = await realSqliteBytes();
    const half = sqlite.subarray(0, Math.floor(sqlite.length * 0.5));
    const zip = await buildZip(path.join(backupDir(), "._import-corrupt.part"), [
      ["manifest.json", JSON.stringify({ version: 3, createdAt: new Date().toISOString(), withUploads: false, withTemplates: false, dbBytes: half.length })],
      ["database.sqlite", half],
    ]);
    const before = listBackups().length;
    await expect(importBackup(zip, "corrupt.zip")).rejects.toThrow(/校验/);
    expect(listBackups().length).toBe(before);
    expect(fs.existsSync(zip)).toBe(false);
    expectNoStagingLeft();
  });

  it("zip 里有越界条目：整份拒收（../ 会写到数据目录之外）", async () => {
    const sqlite = await realSqliteBytes();
    // 两种写法都要拦：前导 `../`（unzipper 会规范化成 `escaped.txt`，于是撞白名单）
    // 与夹在中间的 `uploads/../../`（真正考验 isSafeEntryName 的那条）
    for (const evil of ["../escaped.txt", "uploads/../../escaped2.txt"]) {
      const zip = await buildZip(path.join(backupDir(), `._import-evil-${evil.length}.part`), [
        ["manifest.json", JSON.stringify({ version: 3 })],
        ["database.sqlite", sqlite],
        [evil, "我应该永远不被写到磁盘上"],
      ]);
      const before = listBackups().length;
      // 不锁死具体哪一条检查先动到：unzipper 的规范化顺序属于它的实现细节，
      // 要钉住的是"整份拒收 + 目录外没写出东西 + 不留暂存残骸"这三件事
      await expect(importBackup(zip, "evil.zip")).rejects.toThrow(/拒绝解包/);
      expect(listBackups().length).toBe(before);
      for (const n of ["escaped.txt", "escaped2.txt"]) {
        expect(fs.existsSync(path.join(path.dirname(backupDir()), n))).toBe(false);
        expect(fs.existsSync(path.join(backupDir(), n))).toBe(false);
      }
      expect(fs.existsSync(zip)).toBe(false);
    }
    expectNoStagingLeft();
  });

  it("zip 里带意料之外的条目：同样拒", async () => {
    const sqlite = await realSqliteBytes();
    const zip = await buildZip(path.join(backupDir(), "._import-extra.part"), [
      ["manifest.json", JSON.stringify({ version: 3 })],
      ["database.sqlite", sqlite],
      ["evil.js", "console.log(1)"],
    ]);
    await expect(importBackup(zip, "extra.zip")).rejects.toThrow(/意料之外的条目/);
    expect(fs.existsSync(zip)).toBe(false);
    expectNoStagingLeft();
  });

  it("zip 里没有库：拒", async () => {
    const zip = await buildZip(path.join(backupDir(), "._import-nodb.part"), [
      ["manifest.json", JSON.stringify({ version: 3 })],
      ["uploads/a.txt", "只有文件没有库"],
    ]);
    await expect(importBackup(zip, "nodb.zip")).rejects.toThrow(/没有 database\.sqlite/);
    expect(fs.existsSync(zip)).toBe(false);
    expectNoStagingLeft();
  });
});

/**
 * 每次都现取连接：restoreBackup 内部会 reloadDb() 换掉 `db` 的导出，
 * 模块顶层解构来的句柄在那之后就是关着的（backup-uploads 里也踩过这条）。
 */
async function liveDb(): Promise<(typeof import("../db.ts"))["db"]> {
  return (await import("../db.ts")).db;
}

async function putEmployee(id: string, name: string): Promise<void> {
  (await liveDb()).prepare("INSERT INTO employees (id, name) VALUES (?, ?)").run(id, name);
}

async function row(id: string): Promise<{ name: string } | undefined> {
  return (await liveDb()).prepare("SELECT name FROM employees WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
}
