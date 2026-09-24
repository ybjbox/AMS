import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, History, RotateCcw, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { notifySaveFailure } from '@/store/saveFailure';
import { Button } from '@/components/ui/button';
import {
  fetchBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  backupExportUrl,
  type BackupListResponse,
  type BackupMeta,
} from '@/services/backupApi';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function BackupPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<BackupListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBackups();
      setData(res);
    } catch (err) {
      notifySaveFailure({ title: '读取备份列表失败', error: err });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await createBackup();
      toast.success(`已创建备份：${res.backup.name}`);
      await load();
    } catch (err) {
      notifySaveFailure({ title: '创建备份失败', error: err, retry: handleCreate });
    } finally {
      setBusy(false);
    }
  }, [load]);

  const handleDownload = useCallback((name: string) => {
    const a = document.createElement('a');
    a.href = backupExportUrl(name);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const handleRestore = useCallback(
    async (b: BackupMeta) => {
      const ok = await confirm({
        title: '从备份恢复？',
        description:
          '这将用所选备份覆盖当前数据库。系统会先自动打一份「恢复前」安全备份，可反悔。此操作不可中断，请确认。',
        confirmText: '立即恢复',
        variant: 'danger',
      });
      if (!ok) return;
      setBusy(true);
      try {
        const res = await restoreBackup(b.name);
        toast.success(
          `已从 ${res.restoredFrom} 恢复${res.safetyBackup ? `（安全备份：${res.safetyBackup}）` : ''}`
        );
        if (res.uploadsRestored === false) {
          toast.warning('该备份不含上传文件快照，uploads 目录保持现状未回滚');
        }
        if (res.schemaOk === false) {
          // 恢复的是老 schema 且补跑迁移失败：不提醒的话用户只会看到后续写入莫名 500
          toast.warning(res.schemaNote || '恢复后补跑迁移失败，请重启服务', { duration: 12000 });
        }
        await load();
      } catch (err) {
        notifySaveFailure({ title: '恢复失败', error: err, retry: () => void handleRestore(b) });
      } finally {
        setBusy(false);
      }
    },
    [confirm, load]
  );

  const handleDelete = useCallback(
    async (b: BackupMeta) => {
      const ok = await confirm({
        title: '删除这份备份？',
        description: `将永久删除备份 ${b.name}，此操作不可恢复。`,
        confirmText: '删除',
        variant: 'danger',
      });
      if (!ok) return;
      setBusy(true);
      try {
        await deleteBackup(b.name);
        toast.success(`已删除备份：${b.name}`);
        await load();
      } catch (err) {
        notifySaveFailure({ title: '删除备份失败', error: err, retry: () => void handleDelete(b) });
      } finally {
        setBusy(false);
      }
    },
    [confirm, load]
  );

  const cfg = data?.config;

  return (
    <div className="h-full p-6 flex flex-col min-h-0 space-y-5">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Database className="size-5 text-primary" />
          数据备份与恢复
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          系统会定时对数据库做在线热备份（不中断服务）。如遇误删或磁盘损坏，可随时从备份恢复。
        </p>
      </div>

      {cfg && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-muted dark:bg-background/50 p-3">
            <div className="text-muted-foreground">自动备份</div>
            <div className="font-medium mt-0.5">{cfg.enabled ? '已开启' : '已关闭'}</div>
          </div>
          <div className="rounded-lg bg-muted dark:bg-background/50 p-3">
            <div className="text-muted-foreground">保留天数</div>
            <div className="font-medium mt-0.5">{cfg.retentionDays} 天</div>
          </div>
          <div className="rounded-lg bg-muted dark:bg-background/50 p-3">
            <div className="text-muted-foreground">备份间隔</div>
            <div className="font-medium mt-0.5">{Math.round(cfg.intervalMs / 60000)} 分钟</div>
          </div>
          <div className="rounded-lg bg-muted dark:bg-background/50 p-3">
            <div className="text-muted-foreground">已有备份</div>
            <div className="font-medium mt-0.5">{cfg.count} 份</div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary flex items-center gap-1.5"
          onClick={() => void handleCreate()}
          disabled={busy}
        >
          <Plus className="size-4" />
          立即备份
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted dark:bg-background/60 text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">文件名</th>
              <th className="text-left px-4 py-2.5 font-medium">时间</th>
              <th className="text-right px-4 py-2.5 font-medium">大小</th>
              <th className="text-right px-4 py-2.5 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  加载中…
                </td>
              </tr>
            ) : data && data.backups.length > 0 ? (
              data.backups.map((b) => (
                <tr
                  key={b.name}
                  className="border-t border-border  hover:bg-muted dark:hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {b.name}
                    {b.withUploads ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-3xs font-sans">
                        含文件快照
                      </span>
                    ) : (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-3xs font-sans"
                        title="旧格式备份，仅含数据库；恢复时不会回滚上传文件"
                      >
                        仅数据库
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {formatDate(b.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-secondary">
                    {formatSize(b.size)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="下载"
                        aria-label={`下载备份：${b.name}`}
                        onClick={() => handleDownload(b.name)}
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="恢复"
                        aria-label={`从备份恢复：${b.name}`}
                        className="hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600"
                        onClick={() => void handleRestore(b)}
                        disabled={busy}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="删除"
                        aria-label={`删除备份：${b.name}`}
                        className="hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600"
                        onClick={() => void handleDelete(b)}
                        disabled={busy}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  暂无备份，点击「立即备份」创建第一份
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
