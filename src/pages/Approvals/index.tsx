import PageContainer from "@/components/PageContainer";
import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useUserStore } from '@/store/useUserStore';
import { CheckCircle2, Clock, FileCheck2, Send, XCircle, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/EmptyState';
import { approvalApi, Approval, ApprovalStatus } from '@/services/approvalApi';

const LEAVE_TYPES = ['事假', '病假', '年假', '调休'] as const;
const PUNCH_KINDS = ['上班卡', '下班卡'] as const;

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

/** 审批条目的单行摘要（请假=日期区间；补卡=日期+时间+卡类型） */
function approvalSummary(item: Approval): string {
  if (item.type === 'makeup') {
    return `${item.punchDate || item.startDate} ${item.punchTime} · ${item.punchKind}`;
  }
  return `${item.startDate}${item.endDate && item.endDate !== item.startDate ? ` ~ ${item.endDate}` : ''}`;
}

/** 条目主标题：补卡显示「补卡」，请假显示假别 */
function approvalTitle(item: Approval): string {
  return item.type === 'makeup' ? '补卡' : item.leaveType;
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
  const [formType, setFormType] = useState<'leave' | 'makeup'>('leave');
  const [form, setForm] = useState({
    leaveType: '事假',
    startDate: '',
    endDate: '',
    punchDate: '',
    punchTime: '',
    punchKind: '上班卡' as (typeof PUNCH_KINDS)[number],
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
      setSubmitting(true);
      try {
        if (formType === 'makeup') {
          if (!form.punchDate || !form.punchTime || !form.reason.trim()) return;
          await approvalApi.create({
            type: 'makeup',
            punchDate: form.punchDate,
            punchTime: form.punchTime,
            punchKind: form.punchKind,
            reason: form.reason.trim(),
          });
        } else {
          if (!form.startDate || !form.reason.trim()) return;
          await approvalApi.create({
            type: 'leave',
            leaveType: form.leaveType as (typeof LEAVE_TYPES)[number],
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            reason: form.reason.trim(),
          });
        }
        toast.success('申请已提交');
        setForm({ ...form, startDate: '', endDate: '', punchDate: '', punchTime: '', reason: '' });
        await refresh();
        setTab('mine');
      } catch (err) {
        toast.error(errText(err, '提交失败，请稍后重试'));
      } finally {
        setSubmitting(false);
      }
    },
    [form, formType, refresh]
  );

  const handleDecide = useCallback(
    async (item: Approval, status: Exclude<ApprovalStatus, 'pending'>) => {
      const ok = await confirm({
        title: status === 'approved' ? '通过该申请？' : '驳回该申请？',
        description:
          item.type === 'makeup'
            ? `${item.applicant} 的补卡申请（${item.punchDate} ${item.punchTime}）`
            : `${item.applicant} 的${item.leaveType}申请（${item.startDate}）`,
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
          description={tab === 'mine' ? '在左侧提交你的第一条申请' : '有新的申请时会出现在这里'}
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
                  {tab === 'pending' ? item.applicant : approvalTitle(item)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  {item.type === 'makeup' && <CalendarClock className="w-3 h-3" aria-hidden="true" />}
                  {approvalTitle(item)}
                </span>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {approvalSummary(item)}
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
          <p className="page-subtitle">请假与补卡申请的提交与审批（员工自助）</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 items-start">
        {/* 自助提交表单 */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm p-5 space-y-4"
        >
          <h2 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-zinc-400" /> 提交申请
          </h2>

          {/* 类型切换：请假 / 补卡 */}
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-700/50 p-0.5" role="tablist" aria-label="申请类型">
            {(
              [
                { id: 'leave', label: '请假' },
                { id: 'makeup', label: '补卡' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={formType === t.id}
                onClick={() => setFormType(t.id)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  formType === t.id
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {formType === 'leave' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">类型 <span className="text-red-500" aria-hidden="true">*</span></span>
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
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">开始日期 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
                />
              </label>
              <label className="block col-span-2">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">结束日期（可选）</span>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">补卡日期 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="date"
                  required
                  value={form.punchDate}
                  onChange={(e) => setForm({ ...form, punchDate: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">补卡时间 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="time"
                  required
                  value={form.punchTime}
                  onChange={(e) => setForm({ ...form, punchTime: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
                />
              </label>
              <label className="block col-span-2">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">卡类型 <span className="text-red-500" aria-hidden="true">*</span></span>
                <select
                  value={form.punchKind}
                  onChange={(e) => setForm({ ...form, punchKind: e.target.value as (typeof PUNCH_KINDS)[number] })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
                >
                  {PUNCH_KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
              <p className="col-span-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                补卡审批通过后，将自动补写对应打卡记录并更新考勤异常分析。
              </p>
            </div>
          )}

          <label className="block">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">事由 <span className="text-red-500" aria-hidden="true">*</span></span>
            <textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={formType === 'makeup' ? '请说明漏卡原因（如：忘记打卡、设备故障）' : '请简要说明申请原因'}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white resize-y md:resize-y"
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
