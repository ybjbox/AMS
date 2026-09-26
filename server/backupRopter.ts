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
  BackupCapacityError,
} from "./backupDb.ts";
import { otherInstances } from "./instanceLock.ts";
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
    // 手动备份也要参与滚动清理：只让定时任务清理的话，连点几次「立即备份」就能把
    // 份数上限刷爆（每份都带 uploads + 模板快照）。
    const cfg = getBackupConfig();
    pruneBackups(cfg.retentionDays, { maxCount: cfg.maxCount, maxTotalBytes: cfg.maxTotalMb * 1024 * 1024 });
    res.json({ success: true, backup });
  } catch (e) {
    // 空间不足是运维能自己解决的事（清理/扩容），必须原样说清，不能被收敛成"服务器内部错误"
    if (e instanceof BackupCapacityError) return res.status(507).json({ error: e.message });
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
    // 流错误必须有监听者：备份文件被手工删掉时 read stream 抛 'error'，没人接就是
    // uncaughtException（本站兜底 process.exit(1)），一个下载请求就能打停整站。
    const stream = createReadStream(filePath);
    stream.on("error", (e) => {
      console.error("[backup] 读取备份文件失败：", e);
      if (!res.headersSent) res.status(500).json({ error: "下载备份失败" });
      else res.destroy(e);
    });
    stream.pipe(res);
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
    // 恢复是「换掉主库文件」，只有持有这个数据目录的进程能安全地做。
    // 第二个实例此刻仍握着旧 inode：它之后的每一次写入都落到一个已被 unlink 的文件上 ——
    // 不报错、不留日志、数据永久消失。所以宁可拒掉，也不要静默丢别人的写。
    const others = otherInstances();
    if (others.length > 0) {
      return res.status(409).json({
        error: `同一个数据目录上还有 ${others.length} 个实例在运行（端口 ${others
          .map((o) => o.port)
          .join("、")}）。请先停掉它们再恢复，否则那些实例的写入会静默丢失。`,
      });
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
