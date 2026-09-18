/**
 * 数据库备份与恢复 API（P1-7）。
 * 后端 /api/backup 仅对 ADMIN 及以上开放。
 */
import { http, withAuthToken } from './api';

export interface BackupMeta {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  /** 是否附带 uploads 文件快照（旧备份无此字段 = 只含数据库） */
  withUploads?: boolean;
}

export interface BackupConfig {
  enabled: boolean;
  retentionDays: number;
  intervalMs: number;
  backupDir: string;
  count: number;
}

export interface BackupListResponse {
  config: BackupConfig;
  backups: BackupMeta[];
}

export interface RestoreResponse {
  success: boolean;
  restoredFrom: string;
  safetyBackup?: string;
  /** uploads 目录是否一并回滚（旧备份无快照时 uploads 保持现状） */
  uploadsRestored?: boolean;
}

export const fetchBackups = (): Promise<BackupListResponse> => http.get('/backup');

export const createBackup = (
  label?: string
): Promise<{ success: boolean; backup: BackupMeta }> =>
  http.post('/backup/create', label ? { label } : {});

export const restoreBackup = (name: string): Promise<RestoreResponse> =>
  http.post('/backup/restore', { name });

export const deleteBackup = (name: string): Promise<{ success: boolean }> =>
  http.delete(`/backup/${encodeURIComponent(name)}`);

/** 下载备份文件：后端用 access_token 查询参数带凭据，可直接用链接下载 */
export function backupExportUrl(name: string): string {
  return withAuthToken(`/api/backup/export/${encodeURIComponent(name)}`);
}
