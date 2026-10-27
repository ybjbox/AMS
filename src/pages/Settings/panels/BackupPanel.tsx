import { Pressable } from '@/components/ui/Pressable';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, History, RotateCcw, Trash2, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { notifySaveFailure } from '@/store/saveFailure';
import { scheduleAppReload } from '@/utils/reloadApp';
import { Button } from '@/components/ui/button';
import {
  fetchBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  downloadBackup,
  importBackup,
  BACKUP_IMPORT_MAX_BYTES,
  type BackupListResponse,
  type BackupMeta,
} from '@/services/backupApi';
import { useUserStore } from '@/store/useUserStore';

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
  // 备份文件是含凭据的整库副本，服务端只让超管下载；按钮同源收口，免得 ADMIN 点了必 403
  const canDownload = useUserStore((state) => state.hasPermission('backup:export'));
  // 导入进来的整库副本下一步就是被「恢复」覆盖到线上，服务端收到 SUPER_ADMIN；
  // 按钮同源收口，免得 ADMIN 看见一个点了必 403 的入口
  const canImport = useUserStore((state) => state.hasPermission('backup:import'));
  const [data, setData] = useState<BackupListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // null = 没在传；否则是已上传百分比。导入是"选中文件就开始"的动作，
  // 没有进度反馈的话，几十 MB 的备份看起来就像按钮坏了
  const [importPct, setImportPct] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleDownload = useCallback(async (name: string) => {
    try {
      await downloadBackup(name);
    } catch (err) {
      notifySaveFailure({ title: '下载备份失败', error: err });
    }
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
          `已从 ${res.restoredFrom} 恢复${res.safetyBackup ? `（安全备份：${res.safetyBackup}）` : ''}，界面即将重新载入`
        );
        if (res.uploadsRestored === false) {
          toast.warning('这份备份里没有上传的文件，现有文件保持不变');
        }
        if (res.templatesRestored === false) {
          toast.warning('这份备份里没有导出模板，现有模板保持不变');
        }
        if (res.schemaOk === false) {
          // 恢复的是老库且补跑升级失败：不提醒的话用户只会看到后续写入莫名 500
          toast.warning(res.schemaNote || '数据表升级没成功，请重启服务后再试', { duration: 12000 });
        }
        await load();
        // 换库之后必须重载：其它 store 仍持有恢复前的内存态（见 utils/reloadApp 的说明）
        scheduleAppReload();
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

  const handleImportFile = useCallback(
    async (file: File) => {
      if (file.size > BACKUP_IMPORT_MAX_BYTES) {
        // 先在前端拦掉：服务端也会拒，但要传上去才知道，白等一次上传
        toast.error(`这份文件 ${formatSize(file.size)}，超过导入上限 ${formatSize(BACKUP_IMPORT_MAX_BYTES)}`);
        return;
      }
      setBusy(true);
      setImportPct(0);
      try {
        const res = await importBackup(file, (p) => setImportPct(p));
        toast.success(`已导入 ${res.backup.name} —— 在列表里点「恢复」才会覆盖当前数据`, {
          duration: 9000,
        });
        await load();
      } catch (err) {
        notifySaveFailure({ title: '导入备份失败', error: err });
      } finally {
        setImportPct(null);
        setBusy(false);
      }
    },
    [load]
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
          {canImport && ' 换机器时：在旧机器「下载备份」取到 .zip，到这里「导入备份」，再点恢复。'}
        </p>
      </div>

      {cfg && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
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
            <div className="font-medium mt-0.5">
              {cfg.count} / {cfg.maxCount} 份
            </div>
          </div>
          {/* 备份断了最要命的是没人知道：这两块把"最近一次成功吗"和"还塞得下吗"摊开 */}
          <div className="rounded-lg bg-muted dark:bg-background/50 p-3">
            <div className="text-muted-foreground">最近一次备份</div>
            <div
              className={
                cfg.lastRun === null
                  ? 'font-medium mt-0.5 text-muted-foreground'
                  : `font-medium mt-0.5 ${cfg.lastRun.ok ? '' : 'text-amber-700 dark:text-amber-400'}`
              }
              title={cfg.lastRun?.detail ?? '本次运行还没有备份过（定时任务尚未到点）'}
            >
              {cfg.lastRun === null ? '尚未备份' : cfg.lastRun.ok ? '成功' : '失败'}
              {cfg.lastRun ? <span className="block text-xs font-normal text-muted-foreground">{formatDate(cfg.lastRun.at)}</span> : null}
            </div>
          </div>
          <div className="rounded-lg bg-muted dark:bg-background/50 p-3">
            <div className="text-muted-foreground">磁盘剩余</div>
            <div className="font-medium mt-0.5">
              {cfg.freeMb === null ? '未知' : `${cfg.freeMb >= 1024 ? (cfg.freeMb / 1024).toFixed(1) + ' GB' : cfg.freeMb + ' MB'}`}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {canImport && (
          <>
            {/* 选完即传，没有"先选中再点确认"那一步 —— 少一次可能选错文件的空档 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.db,application/zip,application/x-sqlite3"
              className="sr-only"
              aria-label="选择要导入的备份文件"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // 立刻清空 value：同一个文件连着选两次也要算一次新的上传
                e.target.value = '';
                if (file) void handleImportFile(file);
              }}
            />
            <Pressable
              type="button"
              className="btn-secondary flex items-center gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="size-4" />
              {importPct === null ? '导入备份' : importPct < 100 ? `导入中 ${importPct}%` : '校验中…'}
            </Pressable>
          </>
        )}
        <Pressable
          type="button"
          className="btn-primary flex items-center gap-1.5"
          onClick={() => void handleCreate()}
          disabled={busy}
        >
          <Plus className="size-4" />
          立即备份
        </Pressable>
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
                    {b.format === 'zip' ? (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-3xs font-sans"
                        title="单文件归档：数据库、上传的文件、导出模板都在这一个文件里"
                      >
                        整套归档
                      </span>
                    ) : b.withUploads ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-3xs font-sans">
                        含上传文件
                      </span>
                    ) : (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-3xs font-sans"
                        title="旧格式的备份，只包含数据库；恢复时上传的文件不会被替换"
                      >
                        仅数据库
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {formatDate(b.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {formatSize(b.size)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {canDownload && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="下载"
                          aria-label={`下载备份：${b.name}`}
                          onClick={() => void handleDownload(b.name)}
                        >
                          <Download className="size-4" />
                        </Button>
                      )}
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
