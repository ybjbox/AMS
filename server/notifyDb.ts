/**
 * 通知出站通道配置（#15）：webhook（钉钉/企微/飞书/通用）+ 邮件（SMTP）。
 *
 * 配置存放在通用 settings KV 表（key = 'notify_channels'），与主题配置同模式：
 * 读不到 / 解析失败回退默认值（两个通道都关闭），确保未配置时零副作用。
 *
 * 安全：webhook URL 的 query 里通常带 access_token，等同于凭据；
 * GET 接口只返回掩码串，PUT 时前端回传掩码串 = 保持原值不变。
 */
import { getSetting, setSetting } from "./settingsDb.ts";

export const SETTINGS_KEY_NOTIFY = "notify_channels";

export type WebhookFormat = "dingtalk" | "wecom" | "feishu" | "generic";

export interface NotifyConfig {
  webhook: {
    enabled: boolean;
    url: string;
    format: WebhookFormat;
  };
  email: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
}

const WEBHOOK_FORMATS = new Set<WebhookFormat>(["dingtalk", "wecom", "feishu", "generic"]);

export const MASK_SENTINEL = "********";

/**
 * 显式清除哨兵：面板上点「清除」后回传该串，服务端把已存凭据置空。
 * 空串/掩码串仍表示「保持原值」，避免误触清空。
 */
export const CLEAR_SENTINEL = "__CLEAR__";

export function defaultNotifyConfig(): NotifyConfig {
  return {
    webhook: { enabled: false, url: "", format: "generic" },
    email: { enabled: false, host: "", port: 465, secure: true, user: "", password: "", from: "" },
  };
}

/** 读配置：字段级容错，缺失/非法一律回退默认。 */
export function getNotifyConfig(): NotifyConfig {
  const d = defaultNotifyConfig();
  const raw = getSetting<Partial<NotifyConfig>>(SETTINGS_KEY_NOTIFY);
  if (!raw) return d;
  const w: Partial<NotifyConfig['webhook']> = raw.webhook ?? {};
  const e: Partial<NotifyConfig['email']> = raw.email ?? {};
  return {
    webhook: {
      enabled: !!w.enabled,
      url: typeof w.url === "string" ? w.url : "",
      format: w.format && WEBHOOK_FORMATS.has(w.format) ? w.format : d.webhook.format,
    },
    email: {
      enabled: !!e.enabled,
      host: typeof e.host === "string" ? e.host : "",
      port: Number.isFinite(e.port) ? Number(e.port) : d.email.port,
      secure: e.secure ?? d.email.secure,
      user: typeof e.user === "string" ? e.user : "",
      password: typeof e.password === "string" ? e.password : "",
      from: typeof e.from === "string" ? e.from : "",
    },
  };
}

export function setNotifyConfig(config: NotifyConfig): void {
  setSetting(SETTINGS_KEY_NOTIFY, config);
}

/** 敏感串掩码：保留头尾少量字符便于辨认，中间固定打码。 */
export function maskSecret(s: string): string {
  if (!s) return "";
  if (s.length <= 10) return MASK_SENTINEL;
  return `${s.slice(0, 7)}${MASK_SENTINEL}${s.slice(-4)}`;
}

/** 给前端的面板视图：url/password 打码。 */
export function maskedNotifyConfig(): NotifyConfig {
  const c = getNotifyConfig();
  return {
    webhook: { ...c.webhook, url: maskSecret(c.webhook.url) },
    email: { ...c.email, password: c.email.password ? MASK_SENTINEL : "" },
  };
}

/**
 * 合并 PUT 入参：掩码回传（url/password 等于掩码串或为空串且原值存在）视为「保持原值」；
 * 等于 CLEAR_SENTINEL 则显式清空已存凭据。
 * 其余字段以入参为准（面板每次提交完整配置）。
 */
export function mergeNotifyConfig(input: Partial<NotifyConfig>): NotifyConfig {
  const cur = getNotifyConfig();
  const w = input.webhook ?? cur.webhook;
  const e = input.email ?? cur.email;
  const keepUrl = !w.url || w.url === MASK_SENTINEL || w.url.includes(MASK_SENTINEL);
  const keepPass = !e.password || e.password === MASK_SENTINEL || e.password.includes(MASK_SENTINEL);
  return {
    webhook: {
      enabled: !!w.enabled,
      url: w.url === CLEAR_SENTINEL ? "" : keepUrl ? cur.webhook.url : w.url.trim(),
      format: WEBHOOK_FORMATS.has(w.format) ? w.format : cur.webhook.format,
    },
    email: {
      enabled: !!e.enabled,
      host: String(e.host ?? "").trim(),
      port: Number.isFinite(Number(e.port)) ? Math.trunc(Number(e.port)) : cur.email.port,
      secure: !!e.secure,
      user: String(e.user ?? "").trim(),
      password: e.password === CLEAR_SENTINEL ? "" : keepPass ? cur.email.password : e.password,
      from: String(e.from ?? "").trim(),
    },
  };
}
