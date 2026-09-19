import PageContainer from "@/components/PageContainer";
import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useUserStore } from '@/store/useUserStore';
import { CheckCircle2, Clock, FileCheck2, Send, XCircle, CalendarClock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import Badge, { type BadgeVariant } from '@/components/ui/Badge';
import { approvalApi, Approval, ApprovalStatus } from '@/services/approvalApi';

const LEAVE_TYPES = ['事假', '病假', '年假', '调休'] as const;
const PUNCH_KINDS = ['上班卡', '下班卡'] as const;

const STATUS_META: Record<ApprovalStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已通过', variant: 'success' },
  rejected: { label: '已驳回', variant: 'destructive' },
};

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** 审批条目的单行摘要（按类型展示关键信息） */
function approvalSummary(item: Approval): string {
  if (item.type === 'makeup') {
    return `${item.punchDate || item.startDate} ${item.punchTime} · ${item.punchKind}`;
  }
  if (item.type === 'resign') {
    return `最后工作日 ${item.startDate}`;
  }
  if (item.type === 'conversion') {
    return '试用期转正申请';
  }
  if (item.type === 'overtime') {
    return `${item.startDate} · ${item.hours} 小时`;
  }
  return `${item.startDate}${item.endDate && item.endDate !== item.startDate ? ` ~ ${item.endDate}` : ''}`;
}

/** 条目主标题：补卡/转正/离职/加班显示类型名，请假显示假别 */
function approvalTitle(item: Approval): string {
  const map: Record<string, string> = { makeup: '补卡', conversion: '转正', resign: '离职', overtime: '加班' };
  return map[item.type] ?? item.leaveType;
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
  const [formType, setFormType] = useState<'leave' | 'makeup' | 'conversion' | 'resign' | 'overtime'>('leave');
  const [form, setForm] = useState({
    leaveType: '事假',
    startDate: '',
    endDate: '',
    punchDate: '',
    punchTime: '',
    punchKind: '上班卡' as (typeof PUNCH_KINDS)[number],
    resignDate: '',
    overtimeHours: '2',
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
        } else if (formType === 'conversion') {
          if (!form.reason.trim()) return;
          await approvalApi.create({
            type: 'conversion',
            reason: form.reason.trim(),
          });
        } else if (formType === 'resign') {
          if (!form.resignDate || !form.reason.trim()) return;
          await approvalApi.create({
            type: 'resign',
            startDate: form.resignDate,
            reason: form.reason.trim(),
          });
        } else if (formType === 'overtime') {
          const hours = Number(form.overtimeHours);
          if (!form.startDate || !Number.isFinite(hours) || hours <= 0 || hours > 24 || !form.reason.trim()) return;
          await approvalApi.create({
            type: 'overtime',
            startDate: form.startDate,
            hours: Math.round(hours * 2) / 2,
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
        setForm({ ...form, startDate: '', endDate: '', punchDate: '', punchTime: '', resignDate: '', overtimeHours: '2', reason: '' });
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
            : item.type === 'overtime'
              ? `${item.applicant} 的加班申请（${item.startDate}，${item.hours} 小时）`
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
              {item.type === 'leave' && item.requiredRole === 'ADMIN' && item.status === 'pending' && (
                <p className="text-2xs mt-0.5 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <ShieldCheck className="w-3 h-3" aria-hidden="true" /> ≥3 天假期，需管理员终审
                </p>
              )}
              {item.status !== 'pending' && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  审批人：{item.approver ?? '-'}
                  {item.comment ? ` · 意见：${item.comment}` : ''}
                </p>
              )}
            </div>
            {tab === 'pending' && item.status === 'pending' && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => handleDecide(item, 'approved')}>
                  <CheckCircle2 /> 通过
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDecide(item, 'rejected')}>
                  <XCircle /> 驳回
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <PageContainer className="space-y-6 animate-in fade-in duration-400">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">审批中心</h1>
          <p className="page-subtitle">请假 / 补卡 / 转正 / 离职 / 加班的提交与审批（员工自助，长假需管理员终审）</p>
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

          {/* 类型切换：请假 / 补卡 / 转正 / 离职 / 加班 */}
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-700/50 p-0.5 flex-wrap gap-y-1" role="tablist" aria-label="申请类型">
            {(
              [
                { id: 'leave', label: '请假' },
                { id: 'makeup', label: '补卡' },
                { id: 'conversion', label: '转正' },
                { id: 'resign', label: '离职' },
                { id: 'overtime', label: '加班' },
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
                    ? 'bg-white dark:bg-zinc-800 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

                    {formType === 'leave' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">类型 <span className="text-red-500" aria-hidden="true">*</span></span>
                <Select
                  value={form.leaveType}
                  onValueChange={(val) => setForm({ ...form, leaveType: String(val) })}
                >
                  <SelectTrigger
                    aria-label="请假类型"
                    className="w-full justify-between"
                  >
                    <SelectValue>{(val) => String(val ?? '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">开始日期 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="input-base"
                />
              </label>
              <label className="block col-span-2">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">结束日期（可选）</span>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="input-base"
                />
              </label>
            </div>
          )}

          {formType === 'makeup' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">补卡日期 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="date"
                  required
                  value={form.punchDate}
                  onChange={(e) => setForm({ ...form, punchDate: e.target.value })}
                  className="input-base"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">补卡时间 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="time"
                  required
                  value={form.punchTime}
                  onChange={(e) => setForm({ ...form, punchTime: e.target.value })}
                  className="input-base"
                />
              </label>
              <label className="block col-span-2">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">卡类型 <span className="text-red-500" aria-hidden="true">*</span></span>
                <Select
                  value={form.punchKind}
                  onValueChange={(val) => setForm({ ...form, punchKind: val as (typeof PUNCH_KINDS)[number] })}
                >
                  <SelectTrigger
                    aria-label="补卡类型"
                    className="w-full justify-between"
                  >
                    <SelectValue>{(val) => String(val ?? '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PUNCH_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <p className="col-span-2 text-2xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                补卡审批通过后，将自动补写对应打卡记录并更新考勤异常分析。
              </p>
            </div>
          )}

          {formType === 'conversion' && (
            <div className="space-y-2">
              <p className="text-2xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                转正申请需满足：账号已关联员工档案，且当前状态为「试用期」。
                审批通过后，员工状态将自动变更为「在职」。
              </p>
            </div>
          )}

          {formType === 'resign' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">最后工作日 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="date"
                  required
                  value={form.resignDate}
                  onChange={(e) => setForm({ ...form, resignDate: e.target.value })}
                  className="input-base"
                />
              </label>
              <p className="col-span-2 text-2xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                离职审批通过后：员工状态变更为「离职」，登录账号将被停用（此操作不可逆，请谨慎提交）。
              </p>
            </div>
          )}

          {formType === 'overtime' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">加班日期 <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="input-base"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">时长（小时） <span className="text-red-500" aria-hidden="true">*</span></span>
                <input
                  type="number"
                  required
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={form.overtimeHours}
                  onChange={(e) => setForm({ ...form, overtimeHours: e.target.value })}
                  className="input-base"
                />
              </label>
              <p className="col-span-2 text-2xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                加班审批通过后，时长将自动计入你的调休额度（8 小时 = 1 天）；申请「调休」假时将校验余额。
              </p>
            </div>
          )}


          <label className="block">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
              {formType === 'resign' ? '离职原因' : '事由'} <span className="text-red-500" aria-hidden="true">*</span>
            </span>
            <Textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={
                formType === 'makeup'
                  ? '请说明漏卡原因（如：忘记打卡、设备故障）'
                  : formType === 'conversion'
                    ? '请简要说明转正理由或试用期工作成果'
                    : formType === 'resign'
                      ? '请说明离职原因'
                      : formType === 'overtime'
                        ? '请说明加班事由（如：项目上线支援）'
                        : '请简要说明申请原因'
              }
              className="field-sizing-fixed resize-y"
            />
          </label>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '提交中…' : '提交申请'}
          </Button>
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
                    ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <Clock className="w-4 h-4" /> {t.label}
                {t.id === 'pending' && pending.length > 0 && (
                  <span className="rounded-full bg-red-500 text-white text-3xs px-1.5 leading-4">
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
