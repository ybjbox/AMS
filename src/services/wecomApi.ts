import { http } from './api';

/**
 * 企业微信考勤接入 API — /api/wecom（策略 ADMIN+，见 authMiddleware POLICIES）。
 *
 * 服务端只回掩码后的 Secret；access_token 从不下发前端（官方同样禁止）。
 * 同步走 import_jobs 那套 202 + jobId 轮询通道，一次补拉上百天不会把请求挂住。
 */

export interface WeComConfig {
  enabled: boolean;
  corpId: string;
  agentId: string;
  /** 掩码回显；提交时回传掩码=保持原值，'__CLEAR__'=清除 */
  corpSecret: string;
  baseUrl: string;
  syncIntervalMinutes: number;
  overlapMinutes: number;
}

export const SECRET_MASK = '********';
export const SECRET_CLEAR = '__CLEAR__';

export interface WeComBinding {
  wecomUserId: string;
  employeeId: string | null;
  employeeName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  boundAt: string;
  boundBy: string;
}

export interface WeComUnboundEntry {
  wecomUserId: string;
  count: number;
}

export interface WeComSyncReport {
  dryRun: boolean;
  from: string;
  to: string;
  known: number;
  fetched: number;
  written: number;
  skipped: number;
  unbound: WeComUnboundEntry[];
  missingEmployees: string[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

export interface WeComStatus {
  configured: boolean;
  enabled: boolean;
  scheduler: { intervalMinutes: number; overlapMinutes: number };
  bindings: { total: number; pending: number };
  state: {
    cursorAt: number | null;
    lastSyncAt: string | null;
    lastReport: WeComSyncReport | null;
    lastErrors: string[];
  };
}

export interface WeComJob {
  id: string;
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  created: number;
  skipped: number;
  error: string;
}

export interface SyncRange {
  dateFrom?: string;
  dateTo?: string;
}

export const wecomApi = {
  getConfig: (): Promise<WeComConfig> => http.get<WeComConfig>('/wecom/config'),
  setConfig: (patch: Partial<WeComConfig>): Promise<WeComConfig> => http.put<WeComConfig>('/wecom/config', patch),
  getStatus: (): Promise<WeComStatus> => http.get<WeComStatus>('/wecom/status'),
  test: (): Promise<{ ok: boolean; message: string }> => http.post('/wecom/test', {}),
  getBindings: (): Promise<{ items: WeComBinding[] }> => http.get<{ items: WeComBinding[] }>('/wecom/bindings'),
  setBindings: (items: { wecomUserId: string; employeeId: string | null }[]): Promise<{ items: WeComBinding[] }> =>
    http.put('/wecom/bindings', { items }),
  removeBinding: (wecomUserId: string): Promise<{ removed: boolean }> =>
    http.delete(`/wecom/bindings/${encodeURIComponent(wecomUserId)}`),
  preview: (range: SyncRange): Promise<WeComSyncReport> => http.post('/wecom/preview', range, { timeout: 120000 }),
  startSync: (range: SyncRange): Promise<{ jobId: string }> => http.post('/wecom/sync', range),
  getJob: (jobId: string): Promise<WeComJob> => http.get<WeComJob>(`/wecom/sync/jobs/${jobId}`),
};

/** 服务端中文原因优先，兜底给一句可操作的提示 */
export function wecomError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || '企业微信接口调用失败';
}
