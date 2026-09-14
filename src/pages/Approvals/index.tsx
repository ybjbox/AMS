import PageContainer from "@/components/PageContainer";
import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useUserStore } from '@/store/useUserStore';
import { CheckCircle2, Clock, FileCheck2, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/EmptyState';
import { approvalApi, Approval, ApprovalStatus } from '@/services/approvalApi';

const LEAVE_TYPES = ['事假', '病假', '年假', '调休'] as const;

const STATUS_META: Record<ApprovalStatus, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approved: { label: '已通过', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: '已驳回', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export default function Approvals() {
  const confirm = useConfirm();
  const hasPermission = useUserStore((state) => state.hasPermission);
  const canApprove = hasPermission('approvals:approve');

  const [tab, setTab] = useState<'mine' | 'pending'>('mine');
  const [mine, setMine] = useState<Approval[]>([]);
  const [pending, setPending] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leaveType: '事假',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const jobs: Promise<void>[] = [approvalApi.listMine().then(setMine)];
      if (canApprove) jobs.push(approvalApi.listPending().then(setPending));
      await Promise.all(jobs);
    } catch (e) {
      toast.error(errText(e, '审批数据加载失败'));
    } finally {
      setIsLoading(false);
    }
  }, [canApprove]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.startDate || !form.reason.trim()) return;
      setSubmitting(true);
      try {
        await approvalApi.create({
          leaveType: form.leaveType as (typeof LEAVE_TYPES)[number],
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          reason: form.reason.trim(),
        });
        toast.success('申请已提交');
        setForm({ leaveType: '事假', startDate: '', endDate: '', reason: '' });
        await refresh();
        setTab('mine');
      } catch (err) {
        toast.error(errText(err, '提交失败，请稍后重试'));
      } finally {
        setSubmitting(false);
      }
    },
    [form, refresh]
  );

  const handleDecide = useCallback(
    async (item: Approval, status: Exclude<ApprovalStatus, 'pending'>) => {
      const ok = await confirm({
        title: status === 'approved' ? '通过该申请？' : '驳回该申请？',
        description: `${item.applicant} 的${item.leaveType}申请（${item.startDate}）`,
      });
      if (!ok) return;
      try {
        await approvalApi.decide(item.id, status);
        toast.success(status === 'approved' ? '已通过' : '已驳回');
        await refresh();
      } catch (err) {
        toast.error(errText(err, '操作失败，请稍后重试'));
      }
    },
    [confirm, refresh]
  );

  const list = tab === 'mine' ? mine : pending;

  const renderList = () => {
    if (isLoading) {
      return <div className="p-8 text-sm text-zinc-400 dark:text-zinc-500">加载中…</div>;
    }
    if (list.length === 0) {
      return (
        <EmptyState
          icon={FileCheck2}
          title={tab === 'mine' ? '暂无申请记录' : '没有待审批的申请'}
          description={tab === 'mine' ? '在上方提交你的第一条请假申请' : '有新的申请时会出现在这里'}
        />
      );
    }
    return (
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
        {list.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  {tab === 'pending' ? item.applicant : item.leaveType}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{item.leaveType}</span>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {item.startDate}
                {item.endDate && item.endDate !== item.startDate ? ` ~ ${item.endDate}` : ''}
                · 事由：{item.reason}
              </p>
              {item.status !== 'pending' && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  审批人：{item.approver ?? '-'}
                  {item.comment ? ` · 意见：${item.comment}` : ''}
                </p>
              )}
            </div>
            {tab === 'pending' && item.status === 'pending' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDecide(item, 'approved')}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 通过
                </button>
                <button
                  onClick={() => handleDecide(item, 'rejected')}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> 驳回
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <PageContainer className="space-y-6 animate-in fade-in duration-500">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">审批中心</h1>
          <p className="page-subtitle">请假申请的提交与审批（员工自助）</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 items-start">
        {/* 自助提交表单 */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm p-5 space-y-4"
        >
          <h2 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-zinc-400" /> 提交请假申请
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">类型</span>
              <select
                value={form.leaveType}
                onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">开始日期</span>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
              />
            </label>
            <label className="block col-span-2">
              <span className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">结束日期（可选）</span>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">事由</span>
            <textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="请简要说明申请原因"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {submitting ? '提交中…' : '提交申请'}
          </button>
        </form>

        {/* 列表 */}
        <div className="lg:col-span-3 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm overflow-hidden flex flex-col min-h-[320px]">
          <div className="flex border-b border-zinc-100 dark:border-zinc-700/60">
            {(
              [
                { id: 'mine', label: '我的申请' },
                ...(canApprove ? [{ id: 'pending', label: '待我审批' }] : []),
              ] as Array<{ id: 'mine' | 'pending'; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <Clock className="w-4 h-4" /> {t.label}
                {t.id === 'pending' && pending.length > 0 && (
                  <span className="rounded-full bg-red-500 text-white text-[10px] px-1.5 leading-4">
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">{renderList()}</div>
        </div>
      </div>
    </PageContainer>
  );
}
