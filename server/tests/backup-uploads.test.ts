/**
 * 备份/恢复覆盖 uploads 目录回归测试（第二梯队 #13）：
 * documents.storedPath 指向 data/uploads/ 的磁盘文件，此前备份只 VACUUM INTO 一个
 * .db —— 恢复后文档行存在、文件丢失。现在每份备份配 <name>.uploads sidecar，
 * 恢复时一并回滚；旧备份无快照时保持 uploads 不动。
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
const { createBackup, restoreBackup, deleteBackup, backupDir } = await import("../backupDb.ts");
const { closeDb } = await import("../db.ts");

function put(name: string, content: string): string {
  const p = path.join(UPLOADS_DIR, name);
  fs.writeFileSync(p, content);
  return p;
}

function snapshotOf(backupName: string): string {
  return path.join(backupDir(), `${backupName}.uploads`);
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

describe("createBackup 携带 uploads 快照", () => {
  it("sidecar 目录存在且内容一致，meta.withUploads 为 true", () => {
    put("bkp-a.txt", "doc-A");
    const meta = createBackup("upltest");
    expect(meta.withUploads).toBe(true);
    expect(fs.readFileSync(path.join(snapshotOf(meta.name), "bkp-a.txt"), "utf-8")).toBe("doc-A");
    fs.rmSync(path.join(UPLOADS_DIR, "bkp-a.txt"));
  });
});

describe("restoreBackup 一并回滚 uploads", () => {
  it("快照里的文件回来、快照后的新文件消失，且 pre-restore 安全备份可逆", () => {
    const original = put("bkp-b.txt", "doc-B");
    const backup = createBackup("pair");

    // 备份之后：原文件被删、来了个新文件——恢复应双双翻转
    fs.rmSync(original);
    const extra = put("bkp-c.txt", "doc-C-after-backup");
    expect(fs.existsSync(original)).toBe(false);

    const result = restoreBackup(backup.name);
    expect(result.uploadsRestored).toBe(true);
    expect(fs.readFileSync(original, "utf-8")).toBe("doc-B"); // 回来的文件内容一致
    expect(fs.existsSync(extra)).toBe(false); // 快照之后的文件被回滚掉

    // pre-restore 安全备份自己也带了 uploads 快照（当时含 doc-C）
    expect(fs.existsSync(path.join(snapshotOf(result.safetyBackup!), "bkp-c.txt"))).toBe(true);
  });

  it("旧格式备份（无 sidecar）只恢复 DB，不擅自动 uploads", () => {
    const backup = createBackup("legacy");
    fs.rmSync(snapshotOf(backup.name), { recursive: true, force: true }); // 模拟 v1 旧备份

    const survivor = put("bkp-d.txt", "keep-me");
    const result = restoreBackup(backup.name);
    expect(result.uploadsRestored).toBe(false);
    expect(fs.readFileSync(survivor, "utf-8")).toBe("keep-me");
  });
});

describe("deleteBackup 同步清理 sidecar", () => {
  it("删除备份时 .db 与 .uploads 一起消失", () => {
    const backup = createBackup("del");
    const snap = snapshotOf(backup.name);
    expect(fs.existsSync(snap)).toBe(true);

    expect(deleteBackup(backup.name)).toBe(true);
    expect(fs.existsSync(backup.path)).toBe(false);
    expect(fs.existsSync(snap)).toBe(false);
  });
});
