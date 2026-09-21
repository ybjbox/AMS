/**
 * 到期提醒 API，挂在 /api/reminders（策略：HR 及以上，见 authMiddleware POLICIES）。
 *
 * - GET  /config  当前阈值
 * - PUT  /config  修改阈值（写进 settings KV，全站一份，不再是 localStorage）
 * - GET  /status  上次扫描时间与结果摘要（面板显示"上次扫描 …，共 N 条"）
 * - POST /scan    立即扫描一轮（幂等：待办按未完成去重、通知按 refKey 原地刷新）
 */
import { Router, json } from "express";
import {
  getReminderConfig,
  getReminderStatus,
  scanReminders,
  setReminderConfig,
} from "./remindersDb.ts";
import { validateBody, reminderConfigSchema } from "./validation.ts";

export const remindersRouter = Router();

// 与其余 router 一样自带 body parser：没挂的话 PUT 的 req.body 会是 undefined，
// 直接被 zod 判成 "expected object, received undefined"。
remindersRouter.use(json({ limit: "16kb" }));

remindersRouter.get("/config", (_req, res) => {
  res.json(getReminderConfig());
});

remindersRouter.put("/config", validateBody(reminderConfigSchema), (req, res) => {
  res.json(setReminderConfig(req.body));
});

remindersRouter.get("/status", (_req, res) => {
  res.json(getReminderStatus());
});

remindersRouter.post("/scan", (_req, res) => {
  res.json(scanReminders());
});
