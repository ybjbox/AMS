import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleCheck, CircleX, Fingerprint, Loader2, PlugZap, Plus, Radar, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { notifySaveFailure } from '@/store/saveFailure';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import {
  SECRET_CLEAR,
  SECRET_MASK,
  wecomApi,
  wecomError,
  type WeComBinding,
  type WeComConfig,
  type WeComJob,
  type WeComStatus,
  type WeComSyncReport,
} from '@/services/wecomApi';

const CARD_CLASS = 'bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm';
const LABEL_CLASS = 'text-xs font-medium text-muted-foreground';
const HINT_CLASS = 'text-xs text-muted-foreground mt-1';

function today(): string {
  return new Date().toLocaleDateString('sv-SE');
}

/**
 * 企业微信打卡同步（N1）。
 *
 * 面板只是这条链路的操作面：真正的分段拉取、映射归属、幂等落库都在服务端
 * （server/wecomSync.ts），所以关掉页面不影响定时同步。
 *
 * 「先预览再同步」是刻意的顺序：干跑不写一行数据，可以先确认权限与成员映射对不对。
 */
export default function WeComPanel() {
  const [config, setConfig] = useState<WeComConfig | null>(null);
  const [status, setStatus] = useState<WeComStatus | null>(null);
  const [bindings, setBindings] = useState<WeComBinding[]>([]);
  const [secretDraft, setSecretDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [range, setRange] = useState({ dateFrom: '', dateTo: '' });
  const [preview, setPreview] = useState<WeComSyncReport | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [job, setJob] = useState<WeComJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [newUserId, setNewUserId] = useState('');

  const users = useEmployeeStore((state) => state.users);
  const initialized = useEmployeeStore((state) => state.initialized);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);

  const load = useCallback(async () => {
    try {
      const [cfg, st, bd] = await Promise.all([wecomApi.getConfig(), wecomApi.getStatus(), wecomApi.getBindings()]);
      setConfig(cfg);
      setStatus(st);
      setBindings(bd.items);
    } catch (err) {
      notifySaveFailure({ title: '读取企业微信设置失败', error: err });
    }
  }, []);

  useEffect(() => {
    void load();
    if (!initialized) void fetchUsers();
  }, [load, initialized, fetchUsers]);

  // 同步任务轮询：一次补拉可能跑几十次接口调用，用 202 + jobId 而不是把请求挂住
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await wecomApi.getJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (next.status !== 'running') {
          setJobId(null);
          if (next.status === 'error') toast.error(`同步失败：${next.error}`);
          else toast.success(`同步完成：新增 ${next.created} 条，跳过 ${next.skipped} 条`);
          void load();
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(wecomError(err));
          setJobId(null);
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, load]);

  const employeeName = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.name]));
    return map;
  }, [users]);

  const onSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      // 留空 = 保持原 Secret（服务端按掩码串识别）
      setConfig(await wecomApi.setConfig({ ...config, corpSecret: secretDraft.trim() || SECRET_MASK }));
      setSecretDraft('');
      toast.success('企业微信配置已保存');
      void load();
    } catch (e) {
      notifySaveFailure({ title: '保存企业微信配置失败', error: e, retry: onSave });
    } finally {
      setSaving(false);
    }
  };

  const onClearSecret = async () => {
    setSaving(true);
    try {
      setConfig(await wecomApi.setConfig({ ...(config ?? ({} as WeComConfig)), corpSecret: SECRET_CLEAR }));
      toast.success('应用 Secret 已清除');
      void load();
    } catch (e) {
      notifySaveFailure({ title: '清除 Secret 失败', error: e });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await wecomApi.test());
    } catch (e) {
      setTestResult({ ok: false, message: wecomError(e) });
    } finally {
      setTesting(false);
    }
  };

  const claim = async (wecomUserId: string, employeeId: string | null) => {
    try {
      const res = await wecomApi.setBindings([{ wecomUserId, employeeId: employeeId || null }]);
      setBindings(res.items);
      setClaims((prev) => ({ ...prev, [wecomUserId]: '' }));
      toast.success(employeeId ? `${wecomUserId} 已认领给 ${employeeName.get(employeeId) ?? employeeId}` : `${wecomUserId} 已退回待认领`);
      void load();
    } catch (e) {
      toast.error(wecomError(e));
    }
  };

  const addUserId = async () => {
    const id = newUserId.trim();
    if (!id) return;
    await claim(id, null);
    setNewUserId('');
  };

  const removeBinding = async (wecomUserId: string) => {
    try {
      await wecomApi.removeBinding(wecomUserId);
      setBindings((prev) => prev.filter((b) => b.wecomUserId !== wecomUserId));
      toast.success(`不再同步 ${wecomUserId}`);
    } catch (e) {
      toast.error(wecomError(e));
    }
  };

  const onPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const report = await wecomApi.preview({ dateFrom: range.dateFrom || undefined, dateTo: range.dateTo || undefined });
      setPreview(report);
      toast.success(`预览完成：${report.fetched} 条原始记录，未写入数据`);
      void load();
    } catch (e) {
      toast.error(wecomError(e));
    } finally {
      setPreviewing(false);
    }
  };

  const onSync = async () => {
    setJob(null);
    try {
      const res = await wecomApi.startSync({ dateFrom: range.dateFrom || undefined, dateTo: range.dateTo || undefined });
      setJobId(res.jobId);
    } catch (e) {
      toast.error(wecomError(e));
    }
  };

  const lastReport = status?.state.lastReport ?? null;
  // 预览能看到、但映射表里还没有的账号：先登记（成为待认领），再认领到员工
  const previewUnbound = (preview?.unbound ?? []).filter((u) => !bindings.some((b) => b.wecomUserId === u.wecomUserId));

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-1">企业微信打卡同步</h2>
        <p className={HINT_CLASS}>
          从企业微信取上下班打卡写入考勤。只取打卡时间，位置、WiFi、设备号等字段在服务端边界即丢弃，不进入本系统。
        </p>
      </div>

      {/* ---------------- 凭据 ---------------- */}
      <div className={CARD_CLASS}>
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <Fingerprint className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">应用凭据</h3>
            <p className={HINT_CLASS}>
              企业微信后台「自建应用」里的 CorpID 与 Secret；应用必须配到「打卡 → 可调用接口的应用」，并把本机出口
              IP 加进可信 IP。Secret 与 access_token 只留在服务端。
            </p>
          </div>
        </div>

        {!config ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            加载中…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className={LABEL_CLASS}>企业 ID（CorpID）</span>
                <Input
                  value={config.corpId}
                  onChange={(e) => setConfig({ ...config, corpId: e.target.value })}
                  placeholder="ww1234567890abcdef"
                  maxLength={64}
                  autoComplete="off"
                />
              </label>
              <label className="space-y-1.5">
                <span className={LABEL_CLASS}>应用 AgentId</span>
                <Input
                  value={config.agentId}
                  onChange={(e) => setConfig({ ...config, agentId: e.target.value })}
                  placeholder="1000002"
                  maxLength={32}
                  autoComplete="off"
                />
              </label>
              <label className="space-y-1.5">
                <span className={LABEL_CLASS}>应用 Secret</span>
                <Input
                  value={secretDraft}
                  onChange={(e) => setSecretDraft(e.target.value)}
                  placeholder={config.corpSecret ? `已保存 ${config.corpSecret}，留空则不修改` : '未设置'}
                  maxLength={128}
                  autoComplete="off"
                  type="text"
                />
              </label>
              <label className="space-y-1.5">
                <span className={LABEL_CLASS}>接口地址</span>
                <Input
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  placeholder="https://qyapi.weixin.qq.com"
                  maxLength={200}
                  autoComplete="off"
                />
              </label>
              <label className="space-y-1.5">
                <span className={LABEL_CLASS}>定时同步间隔（分钟）</span>
                <Input
                  type="number"
                  min={10}
                  max={1440}
                  value={config.syncIntervalMinutes}
                  onChange={(e) => setConfig({ ...config, syncIntervalMinutes: Math.round(Number(e.target.value)) })}
                  className="w-32 tabular-nums dark:[color-scheme:dark]"
                />
              </label>
              <label className="space-y-1.5">
                <span className={LABEL_CLASS}>每轮回看（分钟）</span>
                <Input
                  type="number"
                  min={0}
                  max={4320}
                  value={config.overlapMinutes}
                  onChange={(e) => setConfig({ ...config, overlapMinutes: Math.round(Number(e.target.value)) })}
                  className="w-32 tabular-nums dark:[color-scheme:dark]"
                />
              </label>
            </div>

            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked === true })}
                className="border-zinc-300 dark:border-zinc-600"
                id="wecom-enabled"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">开启定时增量同步</span>
              <span className={HINT_CLASS}>关掉时仍可手动预览与同步</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void onSave()} disabled={saving || testing}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                保存配置
              </Button>
              <Button variant="outline" onClick={() => void onTest()} disabled={testing || saving}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
                检测连接
              </Button>
              {config.corpSecret && (
                <Button variant="outline" onClick={() => void onClearSecret()} disabled={saving || testing}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  清除 Secret
                </Button>
              )}
            </div>

            {testResult && (
              <p
                className={`flex items-start gap-2 text-sm ${testResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
                role="status"
              >
                {testResult.ok ? <CircleCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <CircleX className="w-4 h-4 mt-0.5 shrink-0" />}
                <span>{testResult.message}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---------------- 成员映射 ---------------- */}
      <div className={CARD_CLASS}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">成员映射</h3>
        <p className={`${HINT_CLASS} mb-4`}>
          打卡接口只认企业微信账号（userid），必须逐条认领到员工档案；认领错的代价是把别人的打卡灌进这个人的考勤，
          所以系统不按姓名自动匹配。在企业管理后台「通讯录 → 成员」可看到每个人的账号。
        </p>

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <label className="space-y-1.5 grow">
            <span className={LABEL_CLASS}>登记一个企业微信账号（先登记、后认领）</span>
            <Input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addUserId();
              }}
              placeholder="例如 zhangsan"
              maxLength={64}
            />
          </label>
          <Button variant="outline" onClick={() => void addUserId()} disabled={!newUserId.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            登记
          </Button>
        </div>

        {bindings.length === 0 && previewUnbound.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有任何映射。先登记账号并认领到员工，之后才能拉到数据。</p>
        )}

        {(bindings.length > 0 || previewUnbound.length > 0) && (
          <div className="space-y-2">
            {bindings.map((b) => (
              <BindingRow
                key={b.wecomUserId}
                binding={b}
                employeeName={b.employeeId ? employeeName.get(b.employeeId) ?? (b.employeeName || b.employeeId) : ''}
                employees={users.map((u) => ({ id: u.id, name: u.name, department: u.department }))}
                claimValue={claims[b.wecomUserId] ?? ''}
                onClaimValue={(v) => setClaims((prev) => ({ ...prev, [b.wecomUserId]: v }))}
                onClaim={(id) => void claim(b.wecomUserId, id)}
                onRemove={() => void removeBinding(b.wecomUserId)}
              />
            ))}
            {previewUnbound.map((u) => (
              <div key={u.wecomUserId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="grow text-muted-foreground">
                  预览里看到 <span className="font-medium text-zinc-900 dark:text-zinc-100">{u.wecomUserId}</span>（{u.count} 条）还没登记，
                  登记后才能认领并写入考勤。
                </span>
                <Button variant="outline" size="sm" onClick={() => void claim(u.wecomUserId, null)}>
                  <Plus className="h-4 w-4 mr-1" />
                  登记
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- 同步 ---------------- */}
      <div className={CARD_CLASS}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">拉取与同步</h3>
        <p className={HINT_CLASS}>
          留空时间窗即按游标增量同步（每轮回看 {config?.overlapMinutes ?? 120} 分钟补企业微信侧的迟到数据）。
          一次补拉最多 180 天，内部按 29 天分段、每 100 人分批。先预览确认归属正确再同步。
        </p>

        <div className="flex flex-wrap items-end gap-2 mt-4 mb-4">
          <label className="space-y-1.5">
            <span className={LABEL_CLASS}>开始日期</span>
            <Input
              type="date"
              value={range.dateFrom}
              max={range.dateTo || today()}
              onChange={(e) => setRange({ ...range, dateFrom: e.target.value })}
              className="dark:[color-scheme:dark]"
            />
          </label>
          <label className="space-y-1.5">
            <span className={LABEL_CLASS}>结束日期</span>
            <Input
              type="date"
              value={range.dateTo}
              min={range.dateFrom}
              max={today()}
              onChange={(e) => setRange({ ...range, dateTo: e.target.value })}
              className="dark:[color-scheme:dark]"
            />
          </label>
          <Button variant="outline" onClick={() => void onPreview()} disabled={previewing || !!jobId}>
            {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Radar className="h-4 w-4 mr-2" />}
            干跑预览
          </Button>
          <Button onClick={() => void onSync()} disabled={!!jobId || previewing}>
            {jobId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            立即同步
          </Button>
          <span className={HINT_CLASS + ' grow'}>
            {job
              ? `任务 ${job.status === 'running' ? '进行中' : job.status === 'done' ? '已完成' : '失败'}：已处理 ${job.processed} 条，新增 ${job.created} 条，跳过 ${job.skipped} 条`
              : status?.state.cursorAt
                ? `上次同步游标：${new Date(status.state.cursorAt * 1000).toLocaleString('zh-CN', { hour12: false })}`
                : '还没有同步过（首轮增量只回看最近 7 天，历史数据请填日期区间补拉）'}
          </span>
        </div>

        {job?.status === 'error' && <p className="text-sm text-red-700 dark:text-red-400 mb-3">{job.error}</p>}

        <ReportTable title="本次预览（未写入）" report={preview} />
        <ReportTable title="上次同步" report={lastReport} />
      </div>
    </div>
  );
}

function ReportTable({ title, report }: { title: string; report: WeComSyncReport | null }) {
  if (!report) return null;
  return (
    <div className="mt-4 border-t border-zinc-200/60 dark:border-zinc-700/60 pt-4">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
        {title} {report.from} ~ {report.to}
      </h4>
      <p className={HINT_CLASS}>
        映射 {report.known} 个账号 · 拉取 {report.fetched} 条 · {report.dryRun ? '未写入' : `写入 ${report.written} 条`} · 跳过{' '}
        {report.skipped} 条 · 待认领 {report.unbound.length} 人
        {report.missingEmployees.length > 0 && ` · ${report.missingEmployees.length} 个映射指向已删除员工`}
      </p>
      {report.unbound.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {report.unbound.slice(0, 20).map((u) => (
            <li key={u.wecomUserId}>
              <Badge variant="warning">
                {u.wecomUserId} · {u.count} 条
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {report.missingEmployees.length > 0 && (
        <ul className="mt-2 space-y-1">
          {report.missingEmployees.map((m) => (
            <li key={m} className="text-xs text-red-700 dark:text-red-400">
              映射指向已删除员工：{m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface BindingRowProps {
  binding: WeComBinding;
  employeeName: string;
  employees: { id: string; name: string; department: string }[];
  claimValue: string;
  onClaimValue: (value: string) => void;
  onClaim: (employeeId: string | null) => void;
  onRemove: () => void;
}

function BindingRow({ binding, employeeName, employees, claimValue, onClaimValue, onClaim, onRemove }: BindingRowProps) {
  const listId = `wecom-emp-${binding.wecomUserId.replace(/\W/gu, '')}`;
  const matched = employees.find((e) => e.id === claimValue.trim().toUpperCase());
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 p-2.5">
      <span className="w-40 truncate text-sm font-medium text-zinc-900 dark:text-white" title={binding.wecomUserId}>
        {binding.wecomUserId}
      </span>
      {binding.employeeId ? (
        <>
          <Badge variant="success">{binding.employeeId}</Badge>
          <span className="text-sm text-muted-foreground truncate">{employeeName}</span>
          <span className={HINT_CLASS + ' grow'}>认领人 {binding.boundBy || '—'}</span>
          <Button variant="outline" size="sm" onClick={() => onClaim(null)}>
            退回待认领
          </Button>
        </>
      ) : (
        <>
          <Badge variant="warning">待认领</Badge>
          <div className="grow space-y-1">
            <Input
              value={claimValue}
              onChange={(e) => onClaimValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matched) onClaim(matched.id);
              }}
              list={listId}
              placeholder="工号，如 EMP0001"
              aria-label={`为 ${binding.wecomUserId} 认领员工`}
              className="w-44"
            />
            <datalist id={listId}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.department || '未分配'}
                </option>
              ))}
            </datalist>
            {claimValue.trim() && (
              <p className="text-2xs text-muted-foreground">{matched ? `${matched.name} · ${matched.department || '未分配'}` : '未找到该工号'}</p>
            )}
          </div>
          <Button
            size="sm"
            disabled={!matched}
            onClick={() => {
              if (matched) onClaim(matched.id);
            }}
          >
            认领
          </Button>
        </>
      )}
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        最近出现 {binding.lastSeenAt || '—'}
      </span>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`不再同步 ${binding.wecomUserId}`} title="删除映射">
        <Trash2 className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
      </Button>
    </div>
  );
}
