/**
 * 通知出站通道管理 API（#15），挂载于 /api/notify。
 * 访问控制走 authGate 策略表：/notify 全部方法仅 ADMIN。
 *
 * - GET  /config  读取通道配置（webhook url / SMTP 密码打码返回）
 * - PUT  /config  保存配置（回传掩码串 = 保持原凭据不变）
 * - POST /test    按当前已保存配置实发一条测试消息，返回逐通道结果
 */
import { Router, json } from 'express';
import {
  getNotifyConfig,
  setNotifyConfig,
  maskedNotifyConfig,
  mergeNotifyConfig,
} from './notifyDb.ts';
import { sendOutbound } from './notifyDispatch.ts';

export const notifyRouter = Router();
notifyRouter.use(json());

notifyRouter.get('/config', (_req, res) => {
  res.json(maskedNotifyConfig());
});

notifyRouter.put('/config', (req, res) => {
  try {
    const next = mergeNotifyConfig(req.body || {});
    setNotifyConfig(next);
    res.json(maskedNotifyConfig());
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

notifyRouter.post('/test', async (req, res) => {
  const cfg = getNotifyConfig();
  if (!cfg.webhook.enabled && !cfg.email.enabled) {
    return res.status(400).json({ error: '两个通道都未启用，请先在面板中开启并保存' });
  }
  const results = await sendOutbound(cfg, {
    title: 'AMS 通知通道测试',
    message: '看到这条消息说明出站通道配置成功。',
    type: 'info',
    recipient: req.auth?.username ?? 'admin',
  });
  const delivered =
    (cfg.webhook.enabled && !results.webhook) || (cfg.email.enabled && !results.email);
  res.json({ ...results, delivered });
});
