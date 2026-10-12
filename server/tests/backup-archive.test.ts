/**
 * 备份归档层（zip 打包 / 解包）的回归。
 *
 * 这层是"界面导入备份"的地基，也是最容易出安全事故的一层：解包会把外部送来的
 * 条目名直接变成磁盘路径。所以这里的断言一半在正路（往返无损），一半在邪路
 * （越界条目、意料之外的条目、缺库、假文件头、版本不符都必须被拒，且不留残骸）。
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";
import {
  writeArchiveZip,
  extractArchiveZip,
  readArchiveManifest,
  isZipFile,
  type BackupManifest,
} from "../backupArchive.ts";

const tmpDirs: string[] = [];

function mkTmp(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ams-archive-${label}-`));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* Windows 上偶发句柄未释放，交给系统临时目录回收 */
    }
  }
});

function manifest(patch: Partial<BackupManifest> = {}): BackupManifest {
  return {
    version: 3,
    createdAt: new Date().toISOString(),
    appVersion: "1.0.0",
    withUploads: true,
    withTemplates: true,
    dbBytes: 11,
    ...patch,
  };
}

/** 造一个"有内容"的库文件（归档层不看 SQLite 语义，只看字节） */
function fakeDb(dir: string): string {
  const p = path.join(dir, "ams.db");
  fs.writeFileSync(p, "SQLite payload");
  return p;
}

function makeTree(dir: string, files: Record<string, string>): string {
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

/** 用 archiver 直接造任意条目名的 zip —— 用来测试恶意/畸形归档 */
async function buildZip(target: string, entries: Array<[name: string, content: string]>): Promise<void> {
  const out = fs.createWriteStream(target);
  const archive = archiver("zip");
  const closed = new Promise<void>((resolve, reject) => {
    out.on("close", () => resolve());
    archive.on("error", reject);
  });
  archive.pipe(out);
  for (const [name, content] of entries) archive.append(content, { name });
  await archive.finalize();
  await closed;
}

describe("往返：打进去的内容必须原样出来", () => {
  it("库 + uploads + 模板三层都无损", async () => {
    const work = mkTmp("roundtrip");
    const dbFile = fakeDb(work);
    const uploads = makeTree(path.join(work, "uploads"), {
      "a.txt": "文件甲",
      "sub/b.bin": "bbbb",
    });
    const templates = makeTree(path.join(work, "templates"), { "contract.tpl": "模板正文" });
    const zip = path.join(work, "out.zip");

    await writeArchiveZip(zip, {
      dbFile,
      uploadsDir: uploads,
      templatesDir: templates,
      manifest: manifest({ dbBytes: fs.statSync(dbFile).size }),
    });

    expect(isZipFile(zip)).toBe(true);

    const into = path.join(work, "extracted");
    const got = await extractArchiveZip(zip, into);
    try {
      expect(fs.readFileSync(got.dbFile, "utf8")).toBe("SQLite payload");
      expect(got.uploadsDir && fs.existsSync(path.join(got.uploadsDir, "a.txt"))).toBe(true);
      expect(got.uploadsDir && fs.readFileSync(path.join(got.uploadsDir, "sub", "b.bin"), "utf8")).toBe("bbbb");
      expect(got.templatesDir && fs.readFileSync(path.join(got.templatesDir, "contract.tpl"), "utf8")).toBe("模板正文");
      expect(got.manifest?.version).toBe(3);
      expect(got.manifest?.withUploads).toBe(true);
    } finally {
      got.cleanup();
    }
    expect(fs.existsSync(into)).toBe(false); // cleanup 必须把临时目录整个带走
  });

  it("没有 uploads / 模板时也能打、也能解", async () => {
    const work = mkTmp("minimal");
    const zip = path.join(work, "min.zip");
    await writeArchiveZip(zip, { dbFile: fakeDb(work), manifest: manifest({ withUploads: false, withTemplates: false }) });
    const got = await extractArchiveZip(zip, path.join(work, "x"));
    expect(got.uploadsDir).toBeNull();
    expect(got.templatesDir).toBeNull();
    expect(got.manifest?.withUploads).toBe(false);
    got.cleanup();
  });

  it("manifest 坏了不拦：元信息只是给人看的，库能用就该让人恢复", async () => {
    const work = mkTmp("badmanifest");
    const zip = path.join(work, "bad-manifest.zip");
    await buildZip(zip, [["manifest.json", "{ 不是 JSON"], ["database.sqlite", "SQLite payload"]]);
    const got = await extractArchiveZip(zip, path.join(work, "x"));
    expect(got.manifest).toBeNull();
    expect(fs.readFileSync(got.dbFile, "utf8")).toBe("SQLite payload");
    got.cleanup();
  });

  it("readArchiveManifest 只读元信息，不解包", async () => {
    const work = mkTmp("manifest-only");
    const zip = path.join(work, "m.zip");
    await writeArchiveZip(zip, { dbFile: fakeDb(work), manifest: manifest({ appVersion: "9.9.9" }) });
    expect((await readArchiveManifest(zip))?.appVersion).toBe("9.9.9");
    expect(await readArchiveManifest(path.join(work, "不存在.zip"))).toBeNull();
  });
});

describe("解包防线：畸形归档必须整份拒收且不留残骸", () => {
  async function expectRejected(entries: Array<[string, string]>, label: string) {
    const work = mkTmp(label);
    const zip = path.join(work, "evil.zip");
    await buildZip(zip, entries);
    const into = path.join(work, "x");
    await expect(extractArchiveZip(zip, into)).rejects.toThrow();
    expect(fs.existsSync(into)).toBe(false); // 半途而废的目录不能留下
  }

  it("条目名里带 ..（../evil 会写到数据目录之外）", async () => {
    await expectRejected(
      [["manifest.json", "{}"], ["database.sqlite", "x"], ["../evil.txt", "boom"]],
      "traversal"
    );
  });

  it("绝对路径条目", async () => {
    await expectRejected([["manifest.json", "{}"], ["/etc/passwd", "boom"]], "absolute");
  });

  it("意料之外的条目名（白名单之外）", async () => {
    await expectRejected([["manifest.json", "{}"], ["database.sqlite", "x"], ["evil.js", "boom"]], "unknown-entry");
  });

  it("缺 database.sqlite", async () => {
    await expectRejected([["manifest.json", "{}"], ["uploads/a.txt", "x"]], "no-db");
  });

  it("database.sqlite 是 0 字节", async () => {
    await expectRejected([["manifest.json", "{}"], ["database.sqlite", ""]], "empty-db");
  });

  it("manifest 声明的版本不是 3", async () => {
    await expectRejected(
      [["manifest.json", JSON.stringify({ version: 7, createdAt: "" })], ["database.sqlite", "x"]],
      "bad-version"
    );
  });

  it("非 zip 文件（伪装成 .zip 的文本）", async () => {
    const work = mkTmp("not-zip");
    const p = path.join(work, "fake.zip");
    fs.writeFileSync(p, "我只是文本文件");
    expect(isZipFile(p)).toBe(false);
    await expect(extractArchiveZip(p, path.join(work, "x"))).rejects.toThrow(/不是有效的备份归档/);
  });

  it("空 zip（有文件头但没有条目）", async () => {
    const work = mkTmp("empty-zip");
    const zip = path.join(work, "empty.zip");
    await buildZip(zip, []);
    await expect(extractArchiveZip(zip, path.join(work, "x"))).rejects.toThrow(/没有 database\.sqlite/);
  });
});
