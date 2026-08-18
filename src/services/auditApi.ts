/**
 * 审计日志 API（P1-5）。
 * 后端 /api/audit-logs 仅对 ADMIN 及以上开放，且没有删除端点——审计只增不删。
 */
import { http, withAuthToken } from './api';

export type AuditLevel = 'INFO' | 'WARN' | 'ERROR';

export interface AuditLog {
  id: number;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  category: string;
  level: AuditLevel;
  method: string;
  path: string;
  targetType: string;
  targetId: string;
  targetName: string;
  status: number;
  result: 'success' | 'failure';
  ip: string;
  ua: string;
  before: unknown;
  after: unknown;
  changes: string[] | null;
  detail: string;
  durationMs: number;
}

export interface AuditQueryParams {
  q?: string;
  level?: string;
  category?: string;
  actor?: string;
  action?: string;
  result?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditListResponse {
  total: number;
  items: AuditLog[];
  levels: Record<string, number>;
  limit: number;
  offset: number;
  retentionDays: number;
}

export interface AuditFacets {
  actions: string[];
  categories: string[];
  actors: string[];
  total: number;
}

/** 去掉空值，避免把 ?level=&actor= 这类空参数发给后端 */
function clean(params: AuditQueryParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'ALL') continue;
    out[k] = v as string | number;
  }
  return out;
}

export const fetchAuditLogs = (params: AuditQueryParams = {}): Promise<AuditListResponse> =>
  http.get('/audit-logs', { params: clean(params) });

export const fetchAuditFacets = (): Promise<AuditFacets> => http.get('/audit-logs/facets');

/** CSV 导出走浏览器直接下载，用 access_token 查询参数带凭据 */
export function auditExportUrl(params: AuditQueryParams = {}): string {
  const qs = new URLSearchParams(
    Object.entries(clean(params)).map(([k, v]) => [k, String(v)])
  ).toString();
  return withAuthToken(`/api/audit-logs/export${qs ? `?${qs}` : ''}`);
}
