/**
 * 数据库备份与恢复 API（/api/backup），仅 ADMIN 及以上可访问。
 *
 * 端点：
 *   GET    /            列表 + 当前配置
 *   POST   /create      手动触发一次备份（body: { label? }）
 *   GET    /export/:name 下载某份备份文件（带凭据，供前端直接下载）
 *   POST   /restore     从某份备份恢复（body: { name }，危险操作，先打安全备份）
 *   DELETE /:name       删除某份备份文件
 */
import { Router, json } from "express";
import { serverErrorResponse } from "./errorHandler.ts";
import { createReadStream } from "fs";
import {
  createBackup,
  listBackups,
  pruneBackups,
  restoreBackup,
  deleteBackup,
  getBackupConfig,
  isSqliteFile,
} from "./backupDb.ts";
import { requireRole } from "./authMiddleware.ts";

export const backupRopter = Router();
// 此前漏挂 json()：req.body 恒为空 → /restore 永远「缺少备份名称」、/create 的 label 被忽略
backupRopter.use(json());
backupRopter.use(requireRole("ADMIN"));

// GET /api/backup — 列表 + 配置
backupRopter.get("/", (_req, res) => {
  try {
    res.json({ config: getBackupConfig(), backups: listBackups() });
  } catch (e) {
    serverErrorResponse(res, e, "读取备份列表失败");
  }
});

// POST /api/backup/create — 手动备份
backupRopter.post("/create", (req, res) => {
  try {
    const label = typeof req.body?.label === "string" ? req.body.label : undefined;
    const backup = createBackup(label);
    res.json({ success: true, backup });
  } catch (e) {
    serverErrorResponse(res, e, "创建备份失败");
  }
});

// GET /api/backup/export/:name — 下载备份文件
backupRopter.get("/export/:name", (req, res) => {
  try {
    const name = req.params.name;
    if (!name || /[\\/]/.test(name) || name.includes("..")) {
      return res.status(400).json({ error: "非法的备份文件名" });
    }
    const dir = getBackupConfig().backupDir;
    const filePath = `${dir}/${name}`;
    if (!isSqliteFile(filePath)) {
      return res.status(404).json({ error: "备份不存在或已损坏" });
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${encodeURIComponent(name)}`
    );
    createReadStream(filePath).pipe(res);
  } catch (e) {
    serverErrorResponse(res, e, "下载备份失败");
  }
});

// POST /api/backup/restore — 从备份恢复（危险）
backupRopter.post("/restore", (req, res) => {
  try {
    const name = req.body?.name;
    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "缺少备份名称" });
    }
    const result = restoreBackup(name);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "恢复失败" });
  }
});

// DELETE /api/backup/:name — 删除某份备份
backupRopter.delete("/:name", (req, res) => {
  try {
    const name = req.params.name;
    if (!name || /[\\/]/.test(name) || name.includes("..")) {
      return res.status(400).json({ error: "非法的备份文件名" });
    }
    const ok = deleteBackup(name);
    if (!ok) return res.status(404).json({ error: "备份不存在" });
    res.json({ success: true });
  } catch (e) {
    serverErrorResponse(res, e, "删除备份失败");
  }
});
