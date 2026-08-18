/**
 * 通知 CRUD API — 数据按 recipient(username) 隔离，跨设备同步（P2-7）。
 * 系统自动通知（如派单提醒）由 todosDb 内部生成；前端 POST 仅用于当前用户自行添加提醒，
 * 越权指定他人 recipient 会被强制收敛为当前用户（HR/ADMIN 及以上除外）。
 * 路由挂在 /api/notifications，位于 authGate 之后。
 */
import { Router, json } from 'express';
import {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
} from './notificationsDb.ts';
import { ROLE_LEVEL, type SystemRole } from './authDb.ts';
import { validateBody, notificationCreateSchema, errMessage } from './validation.ts';

export const notificationsRouter = Router();
notificationsRouter.use(json());

const canTargetOthers = (role: SystemRole) => ROLE_LEVEL[role] >= ROLE_LEVEL.HR;

notificationsRouter.get('/', (req, res) => {
  res.json(listNotifications(req.auth!.username));
});

notificationsRouter.post('/', validateBody(notificationCreateSchema), (req, res) => {
  const { title, message, type, recipient } = req.body;
  // 收敛 recipient：非 HR/ADMIN 不能给别人发通知，避免垃圾/伪造通知
  const effectiveRecipient =
    recipient && recipient !== req.auth!.username && canTargetOthers(req.auth!.systemRole)
      ? recipient
      : req.auth!.username;
  try {
    const notification = createNotification({
      title,
      message: message ?? '',
      type,
      recipient: effectiveRecipient,
    });
    res.status(201).json(notification);
  } catch (error) {
    res.status(400).json({ error: errMessage(error) });
  }
});

notificationsRouter.put('/:id/read', (req, res) => {
  const ok = markNotificationRead(req.params.id, req.auth!.username);
  if (!ok) return res.status(404).json({ error: 'Notification not found' });
  res.json({ success: true });
});

notificationsRouter.put('/read-all', (req, res) => {
  markAllNotificationsRead(req.auth!.username);
  res.json({ success: true });
});

notificationsRouter.delete('/', (req, res) => {
  // 清空当前用户全部通知（仅自己）
  clearNotifications(req.auth!.username);
  res.json({ success: true });
});

notificationsRouter.delete('/:id', (req, res) => {
  const ok = deleteNotification(req.params.id, req.auth!.username);
  if (!ok) return res.status(404).json({ error: 'Notification not found' });
  res.json({ success: true });
});
