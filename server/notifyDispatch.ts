/**
 * 通知出站派发（#15）：站内通知落库后，按配置镜像推送到 webhook / 邮件。
 *
 * 容错原则（P9）：出站失败绝不影响站内通知与业务请求——
 * dispatchOutbound 是 fire-and-forget，所有异常在内部收敛为 console.warn；
 * 每个通道独立 try/catch，一个挂了另一个照发。
 *
 * 邮件收件人解析：notifications.recipient = accounts.username → accounts.email；
 * 账号没有邮箱则跳过该收件人（不视为错误）。
 */
import { createTransport } from "nodemailer";
import { db } from "./db.ts";
import { asString } from "./sqliteUtil.ts";
import { getNotifyConfig, type NotifyConfig, type WebhookFormat } from "./notifyDb.ts";

export interface OutboundMessage {
  title: string;
  message: string;
  type: string;
  recipient: string;
}

/** 通道结果：null = 成功或跳过；字符串 = 失败原因。 */
export interface ChannelResults {
  webhook: string | null;
  email: string | null;
}

const TIMEOUT_MS = 8000;

export function buildWebhookPayload(
  format: WebhookFormat,
  text: string
): Record<string, unknown> {
  switch (format) {
    case "dingtalk":
      return { msgtype: "text", text: { content: text } };
    case "wecom":
      return { msgtype: "text", text: { content: text } };
    case "feishu":
      return { msg_type: "text", content: { text } };
    default:
      return { text };
  }
}

function formatMessage(m: OutboundMessage): string {
  return `【AMS·${m.type === "error" ? "错误" : m.type === "warning" ? "提醒" : "通知"}】${m.title}\n${m.message}\n（接收人：${m.recipient}）`;
}

/** 钉钉/企微/飞书 HTTP 200 仍可能带业务错误码，一并识别为失败 */
function botApiError(bodyText: string): string | null {
  try {
    const j = JSON.parse(bodyText) as { errcode?: number; ErrorCode?: number; code?: number };
    const code = j.errcode ?? j.ErrorCode ?? j.code;
    if (typeof code === "number" && code !== 0) return `机器人返回错误码 ${code}`;
  } catch {
    /* 非 JSON 响应（generic 通道）按 HTTP 状态判断即可 */
  }
  return null;
}

export async function sendWebhook(
  cfg: NotifyConfig["webhook"],
  m: OutboundMessage
): Promise<string | null> {
  if (!cfg.enabled || !cfg.url) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(cfg.format, formatMessage(m))),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return `webhook 返回 HTTP ${res.status}`;
    return botApiError(await res.text());
  } catch (e) {
    return `webhook 发送失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

function recipientEmail(username: string): string {
  const row = db
    .prepare("SELECT email FROM accounts WHERE username = ?")
    .get(username) as { email: string } | undefined;
  return row ? asString(row.email) : "";
}

export async function sendEmail(
  cfg: NotifyConfig["email"],
  m: OutboundMessage
): Promise<string | null> {
  if (!cfg.enabled || !cfg.host) return null;
  const to = recipientEmail(m.recipient);
  if (!to) return null; // 无邮箱账号：跳过而非失败
  try {
    const transport = createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    });
    await transport.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject: `[AMS] ${m.title}`,
      text: `${m.message}\n\n（接收人：${m.recipient}）`,
    });
    transport.close();
    return null;
  } catch (e) {
    return `邮件发送失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 两通道并行发送；返回各通道结果（供 /test 端点展示）。 */
export async function sendOutbound(
  cfg: NotifyConfig,
  m: OutboundMessage
): Promise<ChannelResults> {
  const [webhook, email] = await Promise.all([sendWebhook(cfg.webhook, m), sendEmail(cfg.email, m)]);
  return { webhook, email };
}

/** 业务侧唯一的出站入口：读配置 → 派发 → 失败仅记日志，绝不抛出。 */
export function dispatchOutbound(m: OutboundMessage): void {
  void (async () => {
    const cfg = getNotifyConfig();
    if (!cfg.webhook.enabled && !cfg.email.enabled) return;
    const results = await sendOutbound(cfg, m);
    for (const r of [results.webhook, results.email]) {
      if (r) console.warn("[notify] %s", r);
    }
  })().catch((e) => console.warn("[notify] 出站派发异常：", e));
}
