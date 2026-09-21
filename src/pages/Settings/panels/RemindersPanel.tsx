import { BellRing, Loader2, Radar } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notifySaveFailure } from '@/store/saveFailure';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import {
  reminderApi,
  type ReminderConfig,
  type ReminderScanReport,
  type ReminderStatus,
} from '@/services/reminderApi';

const KIND_LABEL: Record<ReminderScanReport['items'][number]['kind'], string> = {
  contract: '合同到期',
  probation: '试用期转正',
};

function fieldError(value: number): string {
  if (!Number.isFinite(value) || value < 1 || value > 365) return '天数需为 1-365 之间的整数';
  return '';
}

/**
 * 到期提醒面板：阈值（服务端一份）+ 上次扫描结果 + 立即扫描。
 *
 * 提醒的生成已从浏览器搬到服务端调度（server/remindersDb.ts）：这里只是它的控制面，
 * 关掉本页面不影响提醒生成。
 */
export default function RemindersPanel() {
  const [config, setConfig] = useState<ReminderConfig | null>(null);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);
  const initialized = useEmployeeStore((state) => state.initialized);

  const load = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([reminderApi.getConfig(), reminderApi.getStatus()]);
      setConfig(cfg);
      setStatus(st);
    } catch (err) {
      notifySaveFailure({ title: '读取提醒设置失败', error: err });
    }
  }, []);

  useEffect(() => {
    void load();
    // 扫描结果里要点名员工，档案列表得先就位
    if (!initialized) void fetchUsers();
  }, [load, initialized, fetchUsers]);

  const onSave = async () => {
    if (!config) return;
    const err = fieldError(config.contractExpiryDays) || fieldError(config.probationConversionDays);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      setConfig(await reminderApi.setConfig(config));
      toast.success('提醒阈值已保存');
    } catch (e) {
      notifySaveFailure({ title: '保存提醒阈值失败', error: e, retry: onSave });
    } finally {
      setSaving(false);
    }
  };

  const onScanNow = async () => {
    setScanning(true);
    try {
      const report = await reminderApi.scan();
      setStatus({ lastScanAt: report.scannedAt, lastReport: report });
      toast.success(
        report.recipients.length === 0
          ? '本轮未生成提醒：系统里还没有启用中的 HR 及以上账号'
          : `扫描完成：${report.items.length} 条在办提醒，新增待办 ${report.created} 条`
      );
    } catch (e) {
      notifySaveFailure({ title: '扫描失败', error: e, retry: onScanNow });
    } finally {
      setScanning(false);
    }
  };

  const report = status?.lastReport ?? null;

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">到期提醒</h2>

      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <BellRing className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">提前多少天开始提醒</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              全站一份，由服务端定时任务每 6 小时扫描一次（无人打开系统也会提醒）；提醒只发给启用中的
              HR 及以上账号，不会发给普通员工。
            </p>
          </div>
        </div>

        {!config ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            加载中…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="reminder-contract">
                  合同到期前（天）
                </label>
                <Input
                  id="reminder-contract"
                  type="number"
                  min={1}
                  max={365}
                  value={config.contractExpiryDays}
                  onChange={(e) =>
                    setConfig({ ...config, contractExpiryDays: Math.round(Number(e.target.value)) })
                  }
                  className="w-32 tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="reminder-probation">
                  试用期转正前（天）
                </label>
                <Input
                  id="reminder-probation"
                  type="number"
                  min={1}
                  max={365}
                  value={config.probationConversionDays}
                  onChange={(e) =>
                    setConfig({ ...config, probationConversionDays: Math.round(Number(e.target.value)) })
                  }
                  className="w-32 tabular-nums"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void onSave()} disabled={saving || scanning}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                保存设置
              </Button>
              <Button variant="outline" onClick={() => void onScanNow()} disabled={saving || scanning}>
                {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Radar className="h-4 w-4 mr-2" />}
                立即扫描一次
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">上次扫描</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          {status?.lastScanAt
            ? `${new Date(status.lastScanAt).toLocaleString('zh-CN', { hour12: false })} · 收件人 ${
                status.lastReport?.recipients.length ?? 0
              } 人 · 新增待办 ${status.lastReport?.created ?? 0} 条`
            : '服务启动后还没跑过（默认 5 秒后跑第一轮，之后每 6 小时一次）'}
        </p>
        {report && report.items.length > 0 && (
          <ul className="space-y-1.5 max-h-56 overflow-auto text-sm">
            {report.items.map((item) => (
              <li key={`${item.kind}-${item.employeeId}`} className="flex justify-between gap-4">
                <span className="text-zinc-900 dark:text-zinc-100">
                  {item.employeeName}
                  <span className="text-zinc-500 dark:text-zinc-400">（{item.employeeId}）</span>
                </span>
                <span className="text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                  {KIND_LABEL[item.kind]} {item.dueDate} · 剩 {item.daysLeft} 天
                </span>
              </li>
            ))}
          </ul>
        )}
        {report && report.items.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">当前窗口内没有到期的合同或试用期。</p>
        )}
      </div>
    </div>
  );
}
