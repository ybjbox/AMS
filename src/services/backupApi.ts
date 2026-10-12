/**
 * 数据库备份与恢复 API（P1-7）。
 * 后端 /api/backup 仅对 ADMIN 及以上开放；其中「下载备份」交出的是整库副本
 * （含口令哈希与各类凭据），额外收紧到 SUPER_ADMIN。
 */
import { fetchBlob, http } from './api';

export interface BackupMeta {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  /**
   * 归档形态。`zip` = 单文件（数据库 + 上传文件 + 导出模板都在里面）；
   * `legacy` = 老格式 `ams-x.db`，上传文件与模板在同名 sidecar 目录里（可能没有）。
   * 界面按它决定徽章：zip 恒为整套，不能再拿 withUploads 去判"仅数据库"。
   */
  format: 'zip' | 'legacy';
  /** 仅对 legacy 有意义：sidecar 的 uploads 快照在不在。zip 为 undefined（整套必然带着） */
  withUploads?: boolean;
}

export interface BackupRun {
  at: string;
  ok: boolean;
  detail: string;
}

export interface BackupConfig {
  enabled: boolean;
  retentionDays: number;
  intervalMs: number;
  backupDir: string;
  count: number;
  /** 份数上限：超出即从最旧开始删（每份都带 uploads + 模板快照，不设上界会把磁盘写满） */
  maxCount: number;
  /** 总占用上限（MB）；0 = 不按容量清理 */
  maxTotalMb: number;
  /** 备份目录所在卷剩余空间（MB）；文件系统量不到时为 null */
  freeMb: number | null;
  /** 最近一次备份（定时或手动）的结果；从未跑过时为 null */
  lastRun: BackupRun | null;
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
  /** 导出脚本模板是否一并回滚（模板住在数据卷里，同样只有快照存在才动） */
  templatesRestored?: boolean;
  /** 恢复后是否成功补齐索引与列（false 时面板提示需要重启服务） */
  schemaOk?: boolean;
  /** 恢复后补跑迁移与常驻维护的说明；失败时会写"请重启服务" */
  schemaNote?: string;
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

/** 单文件导入上限，与服务端 backupRopter 的 MAX_IMPORT_BYTES 同一数值 */
export const BACKUP_IMPORT_MAX_BYTES = 200 * 1024 * 1024;

/**
 * 导入一份外部备份（别的机器下载下来的 `.zip`，或老式的裸 `.db`）。
 *
 * 请求体是文件**原始字节**直传，不走 base64+JSON —— 备份动辄几十 MB，
 * 那种写法会把堆打爆（见 AUDIT P2-4）。原文件名只作显示素材，入库名由服务端生成。
 *
 * 注意：**导入 ≠ 恢复**。文件只是进了备份列表，要不要覆盖当前库仍由列表里的
 * 「恢复」决定 —— 分成两步才留有反悔的余地。
 */
export const importBackup = (
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; backup: BackupMeta }> => {
  const params = new URLSearchParams({ name: file.name });
  return http.post<{ success: boolean; backup: BackupMeta }>(`/backup/import?${params.toString()}`, file, {
    // 大文件上传不能用默认的 10s 超时
    timeout: 0,
    headers: { 'Content-Type': 'application/octet-stream' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
};

/**
 * 下载备份文件：改走请求头（fetchBlob）而不是 `?access_token=`。
 * 这个端点交出的是含口令哈希与各条凭据的整库副本，服务端已收紧到只有超管能拿，
 * 再让 7 天有效期的会话 token 出现在 URL 里（浏览器历史 / 下载管理器 / 反代日志）
 * 就等于把「凭据出口」暴露两遍。
 */
export async function downloadBackup(name: string): Promise<void> {
  const blob = await fetchBlob(`/api/backup/export/${encodeURIComponent(name)}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻撤销会让 Safari 来不及取走这个 Blob
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
