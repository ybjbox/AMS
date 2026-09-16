/**
 * 系统诊断 API（可观测性面板）。
 * 后端 /api/system/diagnostics 仅 ADMIN+ 可访问（见 authMiddleware POLICIES）。
 */
import { http } from './api';

export interface AccessLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  slow: boolean;
  actor?: string;
  ip?: string;
  error?: string;
}

export interface DiagnosticsResponse {
  generatedAt: string;
  health: {
    status: 'ok' | 'degraded';
    db: 'up' | 'down';
    uptimeSec: number;
    memHeapMB: number;
    memRssMB: number;
    version: string;
    nodeVersion: string;
  };
  accessLog: {
    total: number;
    slow: number;
    errors: number;
    capacity: number;
    slowThresholdMs: number;
  };
  recent: AccessLogEntry[];
  tableCounts: Record<string, number>;
  requester: string;
}

export const fetchDiagnostics = (): Promise<DiagnosticsResponse> =>
  http.get<DiagnosticsResponse>('/system/diagnostics');
