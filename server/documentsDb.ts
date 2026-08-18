/**
 * 文档管理数据层 — folders / documents / document_sets 三张表。
 * 上传的文件真实落盘到 <DATA_DIR>/uploads/，通过 /api/files/:id 提供下载。
 */
import { db } from "./db.ts";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { resolvePaging, toListResult } from "./listQuery.ts";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    parentId TEXT
  );
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT DEFAULT '',
    url        TEXT DEFAULT '',
    size       INTEGER DEFAULT 0,
    uploadedAt TEXT DEFAULT '',
    folderId   TEXT,
    storedPath TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS document_sets (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    documentIds   TEXT DEFAULT '[]',
    printSettings TEXT DEFAULT '{}'
  );
`);

// ---------- Folders ----------
export function listFolders() {
  return db.prepare("SELECT id, name, parentId FROM folders ORDER BY rowid").all();
}

export function createFolder(input: { id?: string; name: string; parentId?: string | null }) {
  const id = input.id || crypto.randomUUID();
  db.prepare("INSERT INTO folders (id, name, parentId) VALUES (?, ?, ?)").run(
    id, input.name, input.parentId ?? null
  );
  return db.prepare("SELECT id, name, parentId FROM folders WHERE id = ?").get(id);
}

export function updateFolder(id: string, input: { name?: string; parentId?: string | null }) {
  const existing: any = db.prepare("SELECT * FROM folders WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare("UPDATE folders SET name = ?, parentId = ? WHERE id = ?").run(
    input.name ?? existing.name,
    input.parentId === undefined ? existing.parentId : input.parentId,
    id
  );
  return db.prepare("SELECT id, name, parentId FROM folders WHERE id = ?").get(id);
}

/** 级联删除：子文件夹 + 其下文档（含磁盘文件）+ 套件引用清理 */
export function deleteFolderCascade(id: string) {
  const all: any[] = db.prepare("SELECT id, parentId FROM folders").all();
  const toRemove = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of all) {
      if (f.parentId && toRemove.has(f.parentId) && !toRemove.has(f.id)) {
        toRemove.add(f.id);
        changed = true;
      }
    }
  }
  const folderIds = [...toRemove];
  const placeholders = folderIds.map(() => "?").join(", ");
  const docs: any[] = db
    .prepare(`SELECT id, storedPath FROM documents WHERE folderId IN (${placeholders})`)
    .all(...folderIds);
  const docIds = docs.map((d) => d.id);

  // 所有数据库写操作（删文档 + 删文件夹 + 清理套件引用）包在同一个事务里；
  // 任一语句失败整体回滚，避免出现「文件夹删了但文档/引用还在」的半截数据。
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM documents WHERE folderId IN (${placeholders})`).run(...folderIds);
    db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...folderIds);
    removeDocIdsFromSets(docIds);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // 事务提交成功后才删除磁盘文件：若提交失败会回滚，DB 行与磁盘文件保持一致，
  // 不会留下「文件没了但库里还在」的半截状态。
  for (const d of docs) removeStoredFile(d.storedPath);
  return { removedFolderIds: folderIds, removedDocIds: docIds };
}

// ---------- Documents ----------
function rowToDocument(row: any) {
  if (!row) return null;
  const { storedPath, ...doc } = row;
  return doc;
}

export function listDocuments(query: Record<string, any> = {}): any {
  const paging = resolvePaging(query);

  const clauses: string[] = [];
  const params: any[] = [];

  // folderId：缺省=全部；"none"=未归类；具体 id=该文件夹
  const folderId = query.folderId !== undefined ? query.folderId : null;
  if (folderId !== null && folderId !== "all") {
    if (folderId === "none") {
      clauses.push("(folderId IS NULL OR folderId = ?)");
      params.push("");
    } else {
      clauses.push("folderId = ?");
      params.push(folderId);
    }
  }
  const keyword = typeof query.keyword === "string" ? query.keyword.trim() : "";
  if (keyword) {
    clauses.push("name LIKE ?");
    params.push(`%${keyword}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM documents ${where}`).get(...params) as any).c;

  if (!paging.requested) {
    // 向后兼容：未请求分页时返回完整数组
    const rows = db.prepare(`SELECT * FROM documents ${where} ORDER BY rowid`).all(...params) as any[];
    return rows.map(rowToDocument);
  }

  const rows = db
    .prepare(`SELECT * FROM documents ${where} ORDER BY rowid LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset) as any[];
  return toListResult(rows.map(rowToDocument), total, paging);
}

export function getDocumentRaw(id: string): any {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
}

function insertDocumentRow(input: {
  id: string; name: string; type: string; folderId: string | null; filePath: string; size: number;
}): any {
  db.prepare(`INSERT INTO documents (id, name, type, url, size, uploadedAt, folderId, storedPath)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.id,
    input.name,
    input.type,
    `/api/files/${input.id}`,
    input.size,
    new Date().toISOString().split("T")[0],
    input.folderId,
    input.filePath
  );
  return rowToDocument(getDocumentRaw(input.id));
}

export function createDocumentFromUpload(input: {
  name: string; type?: string; folderId?: string | null; buffer: Buffer;
}) {
  const id = crypto.randomUUID();
  const safeName = input.name.replace(/[\\/:*?"<>|]/g, "_");
  const storedPath = path.join(UPLOADS_DIR, `${id}__${safeName}`);
  fs.writeFileSync(storedPath, input.buffer);
  const type = input.type || path.extname(input.name).replace(".", "") || "unknown";
  return insertDocumentRow({ id, name: input.name, type, folderId: input.folderId ?? null, filePath: storedPath, size: input.buffer.length });
}

/**
 * 流式上传落地（P2-4）：文件已由 HTTP 层边收边写到 filePath，
 * 这里只登记元数据，不再对文件内容做二次缓冲。
 */
export function createDocumentFromUploadedFile(input: {
  id: string; name: string; type?: string; folderId?: string | null; filePath: string;
}) {
  const size = fs.statSync(input.filePath).size;
  const type = input.type || path.extname(input.name).replace(".", "") || "unknown";
  return insertDocumentRow({ id: input.id, name: input.name, type, folderId: input.folderId ?? null, filePath: input.filePath, size });
}

export function updateDocument(id: string, input: Record<string, any>) {
  const existing = getDocumentRaw(id);
  if (!existing) return null;
  const allowed = ["name", "type", "folderId"];
  for (const k of allowed) {
    if (input[k] !== undefined) existing[k] = input[k];
  }
  db.prepare("UPDATE documents SET name = ?, type = ?, folderId = ? WHERE id = ?").run(
    existing.name, existing.type, existing.folderId, id
  );
  return rowToDocument(getDocumentRaw(id));
}

export function deleteDocument(id: string) {
  const existing = getDocumentRaw(id);
  if (!existing) return false;
  // 数据库写操作包在事务里（删文档 + 清理套件引用）；提交成功后才删磁盘文件
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    removeDocIdsFromSets([id]);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  removeStoredFile(existing.storedPath);
  return true;
}

function removeStoredFile(storedPath?: string) {
  if (storedPath && fs.existsSync(storedPath)) {
    try { fs.unlinkSync(storedPath); } catch { /* 忽略占用错误 */ }
  }
}

// ---------- Document Sets ----------
function rowToSet(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    documentIds: JSON.parse(row.documentIds || "[]"),
    printSettings: JSON.parse(row.printSettings || "{}"),
  };
}

export function listDocumentSets() {
  return db.prepare("SELECT * FROM document_sets ORDER BY rowid").all().map(rowToSet);
}

export function createDocumentSet(input: any) {
  const id = input.id || crypto.randomUUID();
  db.prepare(`INSERT INTO document_sets (id, name, description, documentIds, printSettings)
              VALUES (?, ?, ?, ?, ?)`).run(
    id, input.name, input.description || "",
    JSON.stringify(input.documentIds || []),
    JSON.stringify(input.printSettings || {})
  );
  return rowToSet(db.prepare("SELECT * FROM document_sets WHERE id = ?").get(id));
}

export function updateDocumentSet(id: string, input: any) {
  const existing = rowToSet(db.prepare("SELECT * FROM document_sets WHERE id = ?").get(id));
  if (!existing) return null;
  const merged = { ...existing, ...input };
  db.prepare(`UPDATE document_sets SET name = ?, description = ?, documentIds = ?, printSettings = ?
              WHERE id = ?`).run(
    merged.name, merged.description || "",
    JSON.stringify(merged.documentIds || []),
    JSON.stringify(merged.printSettings || {}),
    id
  );
  return rowToSet(db.prepare("SELECT * FROM document_sets WHERE id = ?").get(id));
}

export function deleteDocumentSet(id: string) {
  return db.prepare("DELETE FROM document_sets WHERE id = ?").run(id).changes > 0;
}

function removeDocIdsFromSets(docIds: string[]) {
  if (docIds.length === 0) return;
  const sets: any[] = db.prepare("SELECT id, documentIds FROM document_sets").all();
  const update = db.prepare("UPDATE document_sets SET documentIds = ? WHERE id = ?");
  for (const s of sets) {
    const ids: string[] = JSON.parse(s.documentIds || "[]");
    const filtered = ids.filter((d) => !docIds.includes(d));
    if (filtered.length !== ids.length) update.run(JSON.stringify(filtered), s.id);
  }
}

// ---------- 首次播种（仅目录结构，不播种假文件） ----------
(function seedFoldersIfEmpty() {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM folders").get() as any).c;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO folders (id, name, parentId) VALUES (?, ?, ?)");
  insert.run("f1", "人事文件", null);
  insert.run("f2", "入职办理", "f1");
  insert.run("f3", "离职办理", "f1");
  insert.run("f4", "公司制度", null);
  console.log("[db] Seeded 4 folders into SQLite");
})();
