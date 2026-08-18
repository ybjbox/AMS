/**
 * P1-4 回归：级联删除必须包在事务里，中途失败整体回滚，不留半截数据。
 *
 * 直接 import 数据层（documentsDb.ts）在临时 DATA_DIR 上运行，无需启动 HTTP 服务；
 * 通过给 db.prepare 注入一次失败来模拟「删完文件夹/文档后、清理套件引用时崩了」的
 * 中途失败，验证 ROLLBACK 后数据库/磁盘状态一致。
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
}

async function main() {
  // 1. 准备一个与运行服务隔离的临时数据目录
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ams-cascade-"));
  process.env.DATA_DIR = tmp;

  const dbMod = await import("../server/db.ts");
  const db = dbMod.db;
  const doc = await import("../server/documentsDb.ts");

  const UPLOADS = doc.UPLOADS_DIR;
  const uploadsCount = () =>
    fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS).length : 0;

  // ---- 注入「中途失败」：在 removeDocIdsFromSets 的 SELECT 上抛错 ----
  // 该 SELECT 位于事务内、两个 DELETE 之后，能真实模拟「删完实体后清理引用时崩」。
  const realPrepare: (sql: string, ...params: any[]) => any = db.prepare.bind(db);
  let injectFail = false;
  (db as any).prepare = (sql: string, ...args: any[]) => {
    if (injectFail && /FROM document_sets/.test(sql)) {
      throw new Error("injected transaction failure");
    }
    return realPrepare(sql, ...args);
  };

  console.log("\n[1] 级联删除成功路径：文件夹树 + 文档 + 套件引用 + 磁盘文件 一起消失");
  {
    const pid = crypto.randomUUID();
    const cid = crypto.randomUUID();
    doc.createFolder({ id: pid, name: "P1-4-parent" });
    doc.createFolder({ id: cid, name: "P1-4-child", parentId: pid });
    const created = doc.createDocumentFromUpload({
      name: "p1-4-doc.txt",
      folderId: cid,
      buffer: Buffer.from("hello p1-4"),
    });
    const sid = crypto.randomUUID();
    doc.createDocumentSet({ id: sid, name: "set", documentIds: [created.id] });

    const before = uploadsCount();
    const r = doc.deleteFolderCascade(pid);

    check("返回被删文件夹 id 列表", r.removedFolderIds.includes(pid) && r.removedFolderIds.includes(cid));
    check("返回被删文档 id", r.removedDocIds.includes(created.id));
    check("父文件夹已删除", !doc.listFolders().some((f: any) => f.id === pid));
    check("子文件夹已删除", !doc.listFolders().some((f: any) => f.id === cid));
    check("文档已从库删除", !doc.listDocuments().some((d: any) => d.id === created.id));
    const set = doc.listDocumentSets().find((s: any) => s.id === sid);
    check("套件引用已清理", !!set && !set.documentIds.includes(created.id));
    check("磁盘文件已删除", uploadsCount() === before - 1);
    // 收尾
    doc.deleteDocumentSet(sid);
  }

  console.log("\n[2] 级联删除中途失败：整体回滚，文件夹/文档/磁盘都不动");
  {
    const pid = crypto.randomUUID();
    const cid = crypto.randomUUID();
    doc.createFolder({ id: pid, name: "P1-4-fail-parent" });
    doc.createFolder({ id: cid, name: "P1-4-fail-child", parentId: pid });
    const created = doc.createDocumentFromUpload({
      name: "p1-4-fail-doc.txt",
      folderId: cid,
      buffer: Buffer.from("should survive"),
    });
    const sid = crypto.randomUUID();
    doc.createDocumentSet({ id: sid, name: "set-fail", documentIds: [created.id] });
    const before = uploadsCount();

    injectFail = true;
    let threw = false;
    try {
      doc.deleteFolderCascade(pid);
    } catch (e: any) {
      threw = e?.message === "injected transaction failure";
    }
    injectFail = false;

    check("事务内抛错被 propagate", threw);
    check("父文件夹回滚保留", doc.listFolders().some((f: any) => f.id === pid));
    check("子文件夹回滚保留", doc.listFolders().some((f: any) => f.id === cid));
    check("文档回滚保留", doc.listDocuments().some((d: any) => d.id === created.id));
    const set = doc.listDocumentSets().find((s: any) => s.id === sid);
    check("套件引用回滚保留", !!set && set.documentIds.includes(created.id));
    check("磁盘文件回滚保留（未提交不删）", uploadsCount() === before);
    check("回滚后可再次正常删除", (() => {
      try {
        const r = doc.deleteFolderCascade(pid);
        return r.removedFolderIds.includes(pid) && !doc.listFolders().some((f: any) => f.id === cid);
      } catch { return false; }
    })());
    doc.deleteDocumentSet(sid);
  }

  console.log("\n[3] 单文档删除：事务 + 提交后才删磁盘；中途失败回滚");
  {
    const did = crypto.randomUUID();
    const created = doc.createDocumentFromUpload({
      name: "p1-4-single.txt",
      folderId: null,
      buffer: Buffer.from("single doc"),
    });
    const before = uploadsCount();
    const ok = doc.deleteDocument(did);
    check("删除不存在的文档返回 false", ok === false);
    check("删除存在的文档返回 true", doc.deleteDocument(created.id) === true);
    check("单文档磁盘文件已删", uploadsCount() === before - 1);

    // 回滚
    const d2 = doc.createDocumentFromUpload({
      name: "p1-4-single-fail.txt",
      folderId: null,
      buffer: Buffer.from("survive too"),
    });
    const s2 = crypto.randomUUID();
    doc.createDocumentSet({ id: s2, name: "s2", documentIds: [d2.id] });
    const before2 = uploadsCount();
    injectFail = true;
    let threw = false;
    try {
      doc.deleteDocument(d2.id);
    } catch (e: any) {
      threw = e?.message === "injected transaction failure";
    }
    injectFail = false;
    check("单文档删除中途失败被 propagate", threw);
    check("单文档回滚保留", doc.listDocuments().some((d: any) => d.id === d2.id));
    check("单文档磁盘文件回滚保留", uploadsCount() === before2);
    doc.deleteDocument(d2.id);
    doc.deleteDocumentSet(s2);
  }

  // 收尾：关闭连接并清理临时目录
  (db as any).prepare = realPrepare;
  try { db.close(); } catch { /* ignore */ }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail > 0) {
    console.log("失败项：\n - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("回归脚本异常：", e);
  process.exit(1);
});
