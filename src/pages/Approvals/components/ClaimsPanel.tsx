import React, { useCallback, useEffect, useState } from 'react';
import { UserCheck, Copy, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Badge from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { useConfirm } from '@/hooks/useConfirm';
import { claimApi, type Claim } from '@/services/claimApi';

/**
 * 待核对队列（HR 侧）。
 *
 * 员工不"注册"，只"认领"：提交姓名/工号/手机尾号 → 这里逐条当面核对 → 批准后建账号。
 * 批准那一刻等于发身份，所以：一次性口令只显示一次、强制首登改密、驳回必须写原因。
 */
export default function ClaimsPanel({ onDecided }: { onDecided?: () => void }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await claimApi.list();
      setItems(rows);
      setLoadError(null);
      setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
    } catch (e) {
      setLoadError((e as { error?: string })?.error || '认领申请加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = items.find((r) => r.id === selectedId) ?? null;
  const pendingCount = items.filter((r) => r.status === 'pending').length;

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!selected) return;
    if (decision === 'rejected' && !rejectReason.trim()) {
      toast.warning('驳回要写原因，否则对方不知道该怎么办');
      return;
    }
    const ok = await confirm({
      title: decision === 'approved' ? `批准 ${selected.displayName || selected.desiredUsername} 的认领？` : `驳回这条认领申请？`,
      description:
        decision === 'approved'
          ? `将创建账号 ${selected.desiredUsername} 并绑定工号 ${selected.employeeId}；一次性口令只显示这一次，对方首次登录必须改密。`
          : '驳回原因会留给申请人看，通过后不可撤回。',
      variant: decision === 'approved' ? 'primary' : 'danger',
    });
    if (!ok) return;

    setDeciding(true);
    try {
      const res = await claimApi.decide(selected.id, decision, rejectReason);
      if (res.tempPassword) {
        setIssued({ username: selected.desiredUsername, password: res.tempPassword });
      } else {
        toast.success('已驳回');
      }
      setRejectReason('');
      await load();
      onDecided?.();
    } catch (e) {
      toast.error((e as { error?: string })?.error || '核对失败，请稍后再试');
    } finally {
      setDeciding(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">加载中…</div>;
  }
  if (loadError) {
    return <FailedState subject="认领申请" reason={loadError} onRetry={() => void load()} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="还没有人提交认领"
        description="员工在认领页填姓名、工号、手机尾号后，会出现在这里等你当面核对。"
        icon={UserCheck}
      />
    );
  }

  return (
    <div className="grid gap-4 p-4 md:grid-cols-5">
      <div className="md:col-span-2 space-y-1">
        <p className="px-1 pb-1 text-2xs text-muted-foreground">
          共 {items.length} 条 · 待核对 {pendingCount} 条
        </p>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60 rounded-xl border border-zinc-100 dark:border-zinc-700/60 overflow-hidden">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  r.id === selectedId ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/30'
                }`}
                aria-pressed={r.id === selectedId}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">
                    {r.displayName || r.desiredUsername}
                  </span>
                  <Badge variant={r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'neutral'}>
                    {r.status === 'pending' ? '待核对' : r.status === 'approved' ? '已开通' : '已驳回'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-2xs text-muted-foreground tabular-nums">
                  {r.employeeId} · 尾号 {r.phoneTail} · {r.createdAt}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="md:col-span-3 space-y-3">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                {selected.displayName || selected.desiredUsername}
                <span className="ml-2 text-xs font-normal text-muted-foreground">想要用户名 {selected.desiredUsername}</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                <RefreshCw className="size-4" /> 刷新
              </Button>
            </div>

            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50/60 dark:bg-zinc-800/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">对照项</th>
                    <th className="px-3 py-2 text-left font-medium">他自称</th>
                    <th className="px-3 py-2 text-left font-medium">花名册里</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">姓名</td>
                    <td className="px-3 py-2">{selected.displayName || '—'}</td>
                    <td className="px-3 py-2">{selected.employee?.name ?? '档案缺失'}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">工号</td>
                    <td className="px-3 py-2 tabular-nums">{selected.employeeId}</td>
                    <td className="px-3 py-2 tabular-nums">{selected.employee?.id ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">部门</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2">{selected.employee?.department || '—'}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">手机尾号</td>
                    <td className="px-3 py-2 tabular-nums">{selected.phoneTail}</td>
                    <td className="px-3 py-2 tabular-nums">{selected.employee?.phoneTail || '—'}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground">入职日期</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2 tabular-nums">{selected.employee?.joinDate || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {selected.note && (
              <p className="rounded-lg bg-zinc-50 dark:bg-zinc-700/30 px-3 py-2 text-xs text-muted-foreground">
                申请人备注：{selected.note}
              </p>
            )}

            {selected.status === 'pending' ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder="驳回原因（驳回时必填，比如：工号与姓名对不上）"
                  aria-label="驳回原因"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button onClick={() => void decide('approved')} disabled={deciding}>
                    当面核对无误，开通
                  </Button>
                  <Button variant="destructive" onClick={() => void decide('rejected')} disabled={deciding}>
                    驳回
                  </Button>
                </div>
                <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  批准会新建账号并绑定工号；一次性口令只显示一次，请当面交给本人，并提醒首登改密。
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {selected.status === 'approved'
                  ? `已于 ${selected.reviewedAt ?? '—'} 由 ${selected.reviewedBy ?? '—'} 开通`
                  : `已驳回：${selected.rejectReason || '—'}（${selected.reviewedAt ?? '—'}）`}
              </p>
            )}

            {issued && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  账号 {issued.username} 已开通 · 一次性口令（只显示这一次）
                </p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white/70 dark:bg-black/30 px-2 py-1 font-mono text-sm">{issued.password}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(issued.password);
                      toast.success('已复制');
                    }}
                  >
                    <Copy className="size-3.5" /> 复制
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                    我已记下
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">左侧选一条申请。</p>
        )}
      </div>
    </div>
  );
}
