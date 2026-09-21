/**
 * 文档管理 API：
 *   /api/folders        — 文件夹 CRUD（删除时级联）
 *   /api/documents      — 文档 CRUD + base64 上传（真实落盘）
 *   /api/document-sets  — 文件套件 CRUD
 *   /api/files/:id      — 下载真实文件内容
 */
import { Router, json } from "express";
import {
  listFolders, createFolder, updateFolder, deleteFolderCascade,
  listDocuments, getDocumentRaw, createDocumentFromUpload, createDocumentFromUploadedFile, updateDocument, deleteDocument,
  listDocumentSets, createDocumentSet, updateDocumentSet, deleteDocumentSet,
  UPLOADS_DIR,
} from "./documentsDb.ts";
import { asString } from "./sqliteUtil.ts";
import { buildPrintPart } from "./documentPrint.ts";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { validateBody, folderCreateSchema, folderUpdateSchema, documentUpdateSchema, documentSetCreateSchema, documentSetUpdateSchema, errMessage } from "./validation.ts";

export const foldersRouter = Router();
foldersRouter.use(json());

foldersRouter.get("/", (_req, res) => {
  res.json(listFolders());
});

foldersRouter.post("/", validateBody(folderCreateSchema), (req, res) => {
  res.status(201).json(createFolder(req.body));
});

foldersRouter.put("/:id", validateBody(folderUpdateSchema), (req, res) => {
  const updated = updateFolder(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Folder not found" });
  res.json(updated);
});

foldersRouter.delete("/:id", (req, res) => {
  res.json({ success: true, ...deleteFolderCascade(req.params.id) });
});

export const documentsRouter = Router();
// 注意：不再对整条 router 套 json({ limit: "50mb" })。
// 旧实现把文件 base64 塞进 JSON body —— 50MB 文件 → base64 约 67MB + JSON.parse + Buffer
// 峰值内存超 200MB，3 并发即 OOM（P2-4）。现改为「原始二进制 body 流式落盘」（见 POST /upload），
// 内存只持有流的分片，与文件大小无关；仅更新接口需要 json，单独挂载。

documentsRouter.get("/", (req, res) => {
  res.json(listDocuments(req.query));
});

/**
 * 流式上传（P2-4 修复核心）。
 * - 请求体为原始文件字节（Content-Type: application/octet-stream），直接管道写入磁盘，
 *   不经过 base64 / JSON.parse / 整段 Buffer，内存占用与文件大小无关。
 * - 元数据（name / folderId / type）走 query string（URL 编码），不进 body。
 * - 客户端中断 / 写盘失败都会清理半截文件，不会留下悬空磁盘文件。
 */
documentsRouter.post("/upload", (req, res) => {
  const url = new URL(req.originalUrl, "http://localhost");
  const name = url.searchParams.get("name");
  const folderId = url.searchParams.get("folderId") || null;
  const type = url.searchParams.get("type") || undefined;

  if (!name) {
    return res.status(400).json({ error: "name query parameter is required" });
  }

  const id = crypto.randomUUID();
  const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
  const storedPath = path.join(UPLOADS_DIR, `${id}__${safeName}`);
  const writeStream = fs.createWriteStream(storedPath);

  // 让审计网关在 finish 时能从 req.body 读到文件名（本路由不挂 json 解析，默认是 {}）
  req.body = { name, folderId, type };

  let settled = false;
  const fail = (status: number, message: string) => {
    if (settled) return;
    settled = true;
    try { fs.unlinkSync(storedPath); } catch { /* 文件可能还没建好 */ }
    if (!res.headersSent) res.status(status).json({ error: message });
  };

  req.on("aborted", () => {
    writeStream.destroy();
    fail(400, "client aborted upload");
  });
  req.on("error", () => {
    writeStream.destroy();
    fail(400, "upload stream error");
  });
  writeStream.on("error", () => {
    fail(500, "failed to write uploaded file");
  });
  writeStream.on("finish", () => {
    if (settled) return;
    try {
      const doc = createDocumentFromUploadedFile({ id, name, type, folderId, filePath: storedPath });
      settled = true;
      res.status(201).json(doc);
    } catch (error) {
      fail(500, "failed to register document");
    }
  });

  // 磁盘耗尽防护（P1-5）：
  // 1) 优先用 Content-Length 预检（立即 413，不读流）；
  // 2) 无长度/分块上传走流式计数兜底。
  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: "uploaded file exceeds 50MB limit" });
  }
  let uploadedBytes = 0;
  req.on("data", (chunk: Buffer) => {
    uploadedBytes += chunk.length;
    if (uploadedBytes > MAX_UPLOAD_BYTES) {
      req.unpipe(writeStream);
      writeStream.destroy();
      // 暂停而不是销毁请求：保证 413 响应能完整送达客户端
      req.pause();
      fail(413, "uploaded file exceeds 50MB limit");
    }
  });

  req.pipe(writeStream);
});

documentsRouter.put("/:id", json(), validateBody(documentUpdateSchema), (req, res) => {
  const updated = updateDocument(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Document not found" });
  res.json(updated);
});

documentsRouter.delete("/:id", (req, res) => {
  if (!deleteDocument(req.params.id)) return res.status(404).json({ error: "Document not found" });
  res.json({ success: true });
});

/**
 * 「一键打包打印」的内容装配：按类型返回可打印片段（文本 / 表格 / 图片页）。
 * 读权限与 /api/files/:id 下载同档（默认策略 EMPLOYEE 可读），不额外放宽也不额外收紧。
 */
documentsRouter.get("/:id/print-part", async (req, res) => {
  const part = await buildPrintPart(req.params.id);
  if (!part) return res.status(404).json({ error: "Document not found" });
  res.json(part);
});

export const documentSetsRouter = Router();
documentSetsRouter.use(json());

documentSetsRouter.get("/", (_req, res) => {
  res.json(listDocumentSets());
});

documentSetsRouter.post("/", validateBody(documentSetCreateSchema), (req, res) => {
  res.status(201).json(createDocumentSet(req.body));
});

documentSetsRouter.put("/:id", validateBody(documentSetUpdateSchema), (req, res) => {
  const updated = updateDocumentSet(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Document set not found" });
  res.json(updated);
});

documentSetsRouter.delete("/:id", (req, res) => {
  if (!deleteDocumentSet(req.params.id)) return res.status(404).json({ error: "Document set not found" });
  res.json({ success: true });
});

// 文件下载
export const filesRouter = Router();
filesRouter.get("/:id", (req, res) => {
  const doc = getDocumentRaw(req.params.id);
  const storedPath = asString(doc?.storedPath);
  const docName = asString(doc?.name);
  if (!doc || !storedPath || !fs.existsSync(storedPath)) {
    return res.status(404).json({ error: "File not found" });
  }
  // attachment + nosniff：HR 上传的 HTML/SVG 不允许在 API 源上内联渲染，堵存储型 XSS
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(docName)}`
  );
  res.sendFile(storedPath);
});
