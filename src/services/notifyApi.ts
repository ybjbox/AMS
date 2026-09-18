import { http } from './api';

/**
 * 通知出站通道 API — 对接后端 notifyRouter（/api/notify，仅 ADMIN）。
 * GET/PUT 的凭据字段（webhook url / SMTP 密码）以掩码串返回；
 * 保存时原样回传掩码串 = 保持服务端原值不变。
 */

export type WebhookFormat = 'dingtalk' | 'wecom' | 'feishu' | 'generic';

/** 与后端 notifyDb.CLEAR_SENTINEL 配对：回传该串 = 服务端清空已存凭据 */
export const CLEAR_SENTINEL = '__CLEAR__';

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

export interface NotifyTestResult {
  /** null = 成功（或通道未启用）；字符串 = 失败原因 */
  webhook: string | null;
  email: string | null;
  delivered: boolean;
}

export const fetchNotifyConfig = (): Promise<NotifyConfig> =>
  http.get<NotifyConfig>('/notify/config');

export const saveNotifyConfig = (config: NotifyConfig): Promise<NotifyConfig> =>
  http.put<NotifyConfig>('/notify/config', config);

export const testNotify = (): Promise<NotifyTestResult> =>
  http.post<NotifyTestResult>('/notify/test', {});
