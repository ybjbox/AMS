/**
 * P3-6 回归：data/uploads 孤儿文件扫描与清理。
 * 自包含：建临时 DATA_DIR → runMigrations → 用真实 createDocumentFromUpload 写一份「被引用」文件，
 * 再手动丢一个「孤儿」文件 → 验证 findOrphanUploads 能识别孤儿且不误伤被引用文件，
 * dry-run 不删、真实删除后磁盘消失、复扫为空。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-orphan-"));
const DATA_DIR = process.env.DATA_DIR;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

async function main() {
  const migrate = await import("../server/migrate.ts");
  migrate.runMigrations();
  const docs = await import("../server/documentsDb.ts");
  const { findOrphanUploads, removeOrphanUploads } = await import("../server/uploadsCleanup.ts");
  const { db } = await import("../server/db.ts");

  // 被引用的文件：走真实上传路径，落盘 + 入库
  const refDoc = docs.createDocumentFromUpload({
    name: "被引用.pdf",
    type: "application/pdf",
    folderId: null,
    buffer: Buffer.from("real content"),
  });
  const refRow = db
    .prepare("SELECT storedPath FROM documents WHERE id = ?")
    .get(refDoc.id) as { storedPath: string };
  const referencedPath = refRow.storedPath;
  ok("被引用文件已落盘", fs.existsSync(referencedPath));

  // 孤儿文件：直接写一个不被任何文档引用的文件
  const orphanPath = path.join(docs.UPLOADS_DIR, `${crypto.randomUUID()}__orphan.tmp`);
  fs.writeFileSync(orphanPath, "orphan junk");
  ok("孤儿文件已写入", fs.existsSync(orphanPath));

  // 扫描
  const orphans = findOrphanUploads();
  ok("孤儿文件被识别", orphans.includes(orphanPath), `-> 命中 ${orphans.length} 个`);
  ok("被引用文件不被误判为孤儿", !orphans.includes(referencedPath));

  // dry-run
  const dry = removeOrphanUploads({ dryRun: true });
  ok("dry-run 报告找到孤儿", dry.found >= 1, `-> found=${dry.found}`);
  ok("dry-run 不实际删除", fs.existsSync(orphanPath));

  // 真实删除
  const real = removeOrphanUploads({ dryRun: false });
  ok("真实删除移除孤儿文件", real.removed.includes(orphanPath), `-> removed=${real.removed.length}`);
  ok("磁盘上孤儿文件已消失", !fs.existsSync(orphanPath));
  ok("被引用文件仍保留", fs.existsSync(referencedPath));

  // 复扫应为空（孤儿已删，被引用文件仍被引用）
  const after = findOrphanUploads();
  ok("清理后无孤儿残留", after.length === 0, `-> ${JSON.stringify(after.map((p) => path.basename(p)))}`);

  // 清理被引用文件与库行
  try {
    fs.unlinkSync(referencedPath);
  } catch {}
  db.prepare("DELETE FROM documents WHERE id = ?").run(refDoc.id);
}

main()
  .catch((e) => {
    console.error("脚本异常：", e);
    fail++;
  })
  .finally(() => {
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {}
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail > 0) {
      console.log("失败项：\n - " + fails.join("\n - "));
      process.exit(1);
    }
    process.exit(0);
  });
