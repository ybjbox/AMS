/**
 * 公告路由（P0：公告发布）。
 *
 * 权限（authMiddleware POLICIES）：
 * - GET /api/announcements       → 登录用户可读（default read = EMPLOYEE+）
 * - GET /api/announcements/all   → ADMIN（管理列表含停用/过期）
 * - POST/PUT/DELETE              → ADMIN
 */
import { Router, json } from "express";
import {
  listEffectiveAnnouncements,
  listAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "./announcementsDb.ts";
import { createNotification } from "./notificationsDb.ts";
import { db } from "./db.ts";
import { asString } from "./sqliteUtil.ts";

export const announcementsRouter = Router();
announcementsRouter.use(json());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 全员可见：有效公告（支持 limit，默认全部） */
announcementsRouter.get("/", (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : undefined;
  res.json(listEffectiveAnnouncements(limit));
});

/** 管理列表（含停用/过期）：ADMIN */
announcementsRouter.get("/all", (_req, res) => {
  res.json(listAllAnnouncements());
});

/** 发布公告：ADMIN。notifyAll=true 时同步向所有账号下发通知。 */
announcementsRouter.post("/", (req, res, next) => {
  try {
    const { title, content, priority, expiresAt, notifyAll } = req.body || {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "请填写公告标题" });
    }
    if (expiresAt && !DATE_RE.test(String(expiresAt))) {
      return res.status(400).json({ error: "有效期格式应为 YYYY-MM-DD" });
    }
    const row = createAnnouncement({
      title: title.trim().slice(0, 120),
      content: typeof content === "string" ? content.slice(0, 5000) : "",
      priority: priority === "important" ? "important" : "normal",
      publisher: req.auth?.username ?? "",
      expiresAt: expiresAt ? String(expiresAt) : "",
    });

    // 可选：全员通知（向所有账号下发；通知中心按未读去重）
    if (notifyAll) {
      const accounts = db.prepare("SELECT username FROM accounts").all().map((r) => asString(r.username));
      for (const username of accounts) {
        if (!username) continue;
        createNotification({
          title: `新公告：${row.title}`,
          message: row.content ? row.content.slice(0, 120) : "请前往控制台查看",
          type: row.priority === "important" ? "warning" : "info",
          recipient: username,
        });
      }
    }

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

/** 更新公告（含启停）：ADMIN */
announcementsRouter.put("/:id", (req, res, next) => {
  try {
    const { title, content, priority, expiresAt, active } = req.body || {};
    // 判定与写入必须同一个条件：原先这里看的是「truthy」，写入看的是「!== undefined」，
    // 于是 {expiresAt:false} 或 {expiresAt:0} 会跳过格式检查、再把 String(false)="false" 写进日期列。
    // 空串是合法值（= 清除有效期，与 POST 的 ?? "" 同口径）。
    if (expiresAt !== undefined && expiresAt !== "" && !DATE_RE.test(String(expiresAt))) {
      return res.status(400).json({ error: "有效期格式应为 YYYY-MM-DD" });
    }
    const row = updateAnnouncement(req.params.id, {
      title: typeof title === "string" ? title.trim().slice(0, 120) : undefined,
      content: typeof content === "string" ? content.slice(0, 5000) : undefined,
      priority: priority === "important" ? "important" : priority === "normal" ? "normal" : undefined,
      expiresAt: expiresAt === undefined ? undefined : String(expiresAt),
      active: active === undefined ? undefined : active ? 1 : 0,
    });
    if (!row) return res.status(404).json({ error: "公告不存在" });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

/** 删除公告：ADMIN */
announcementsRouter.delete("/:id", (req, res) => {
  if (!deleteAnnouncement(req.params.id)) return res.status(404).json({ error: "公告不存在" });
  res.json({ success: true });
});
