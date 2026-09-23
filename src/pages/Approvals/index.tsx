import PageContainer from "@/components/PageContainer";
import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useUserStore } from '@/store/useUserStore';
import { CheckCircle2, Clock, FileCheck2, Send, XCircle, CalendarClock, ShieldCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import Badge, { type BadgeVariant } from '@/components/ui/Badge';
import { BaseModal } from '@/components/ui/BaseModal';
import { approvalApi, Approval, ApprovalStatus, type CompBalance } from '@/services/approvalApi';

const LEAVE_TYPES = ['事假', '病假', '年假', '调休'] as const;
const PUNCH_KINDS = ['上班卡', '下班卡'] as const;

const STATUS_META: Record<ApprovalStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已通过', variant: 'success' },
  rejected: { label: '已驳回', variant: 'destructive' },
  withdrawn: { label: '已撤回', variant: 'neutral' },
};

/** 台账筛选（status 值与后端 listApprovals 一致） */
const LEDGER_FILTERS: Array<{ id: 'decided' | 'pending' | 'approved' | 'rejected' | 'withdrawn' | ''; label: string }> = [
  { id: 'decided', label: '已处理' },
  { id: 'pending', label: '还在等' },
  { id: 'approved', label: '已通过' },
  { id: 'rejected', label: '已驳回' },
  { id: 'withdrawn', label: '已撤回' },
  { id: '', label: '全部' },
];

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

  const [tab, setTab] = useState<'mine' | 'pending' | 'ledger'>('mine');
  const [mine, setMine] = useState<Approval[]>([]);
  const [pending, setPending] = useState<Approval[]>([]);
  const [ledger, setLedger] = useState<Approval[]>([]);
  const [ledgerStatus, setLedgerStatus] = useState<(typeof LEDGER_FILTERS)[number]['id']>('decided');
  const [ledgerMonth, setLedgerMonth] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [balance, setBalance] = useState<CompBalance | null>(null);
  /** 决定对话框的目标：1 条=单条决定，>1 条=批量 */
  const [decideTarget, setDecideTarget] = useState<Approval[] | null>(null);
  const [comment, setComment] = useState('');
  const [deciding, setDeciding] = useState(false);
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
      const jobs: Promise<void>[] = [
        approvalApi.listMine().then(setMine),
        approvalApi.compBalance().then(setBalance).catch(() => setBalance(null)),
      ];
      if (canApprove) {
        jobs.push(approvalApi.listPending().then(setPending));
        jobs.push(
          approvalApi
            .listAll({ status: ledgerStatus || undefined, month: ledgerMonth || undefined, limit: 300 })
            .then(setLedger)
        );
      }
      await Promise.all(jobs);
    } catch (e) {
      toast.error(errText(e, '审批数据加载失败'));
    } finally {
      setIsLoading(false);
    }
  }, [canApprove, ledgerStatus, ledgerMonth]);

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

  /** 打开决定对话框：传 1 条=单条决定，传多条=批量决定 */
  const openDecide = useCallback((items: Approval[]) => {
    setComment('');
    setDecideTarget(items);
  }, []);

  const submitDecide = useCallback(
    async (status: 'approved' | 'rejected') => {
      const items = decideTarget ?? [];
      if (items.length === 0) return;
      if (status === 'rejected' && !comment.trim()) {
        toast.error('驳回请填写意见');
        return;
      }
      setDeciding(true);
      try {
        if (items.length === 1) {
          await approvalApi.decide(items[0].id, status, comment.trim());
          toast.success(status === 'approved' ? '已通过' : '已驳回');
        } else {
          const res = await approvalApi.batchDecide(
            items.map((i) => i.id),
            status,
            comment.trim()
          );
          toast.success(
            `已${status === 'approved' ? '通过' : '驳回'} ${res.decided.length} 条` +
              (res.failed.length > 0 ? `；${res.failed.length} 条未处理（${res.failed[0].error}）` : '')
          );
        }
        setDecideTarget(null);
        setSelectedIds([]);
        await refresh();
      } catch (err) {
        toast.error(errText(err, '操作失败，请稍后重试'));
      } finally {
        setDeciding(false);
      }
    },
    [decideTarget, comment, refresh]
  );

  const onWithdraw = useCallback(
    async (item: Approval) => {
      const ok = await confirm({
        title: '撤回该申请？',
        description: `${approvalTitle(item)}（${item.startDate}）撤回后可以重新提交。`,
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await approvalApi.withdraw(item.id);
        toast.success('已撤回');
        await refresh();
      } catch (err) {
        toast.error(errText(err, '撤回失败'));
      }
    },
    [confirm, refresh]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const list = tab === 'mine' ? mine : tab === 'pending' ? pending : ledger;
  const selectable = tab === 'pending' ? pending.filter((i) => i.status === 'pending') : [];
  const selectedItems = selectable.filter((i) => selectedIds.includes(i.id));

  const renderList = () => {
    if (isLoading) {
      return <div className="p-8 text-sm text-muted-foreground">加载中…</div>;
    }
    if (list.length === 0) {
      return (
        <EmptyState
          icon={FileCheck2}
          title={
            tab === 'mine' ? '暂无申请记录' : tab === 'pending' ? '没有待审批的申请' : '该条件下没有审批记录'
          }
          description={
            tab === 'mine'
              ? '在左侧提交你的第一条申请'
              : tab === 'pending'
                ? '有新的申请时会出现在这里'
                : '换个状态筛选或清空月份试试；历史记录不会因已处理而消失'
          }
        />
      );
    }
    return (
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
        {list.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex items-start gap-2">
              {tab === 'pending' && item.status === 'pending' && (
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={() => toggleSelect(item.id)}
                  aria-label={`选择 ${item.applicant} 的${approvalTitle(item)}申请`}
                  className="mt-0.5"
                />
              )}
              <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                  {tab === 'mine' ? approvalTitle(item) : `${item.applicant} · ${approvalTitle(item)}`}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {item.type === 'makeup' && <CalendarClock className="w-3 h-3" aria-hidden="true" />}
                  {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                </span>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {approvalSummary(item)}
                · 事由：{item.reason}
              </p>
              {item.type === 'leave' && item.requiredRole === 'ADMIN' && item.status === 'pending' && (
                <p className="text-2xs mt-0.5 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <ShieldCheck className="w-3 h-3" aria-hidden="true" /> ≥3 天假期，需管理员终审
                </p>
              )}
              {item.status !== 'pending' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.status === 'withdrawn' ? '处理：' : '审批人：'}
                  {item.status === 'withdrawn' ? '本人撤回' : (item.approver ?? '-')}
                  {item.comment ? ` · 意见：${item.comment}` : ''}
                  {item.decidedAt ? ` · ${new Date(item.decidedAt.replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })}` : ''}
                </p>
              )}
              </div>
            </div>
            {tab === 'pending' && item.status === 'pending' && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => openDecide([item])}>
                  <CheckCircle2 /> 通过
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openDecide([item])}>
                  <XCircle /> 驳回
                </Button>
              </div>
            )}
            {tab === 'mine' && item.status === 'pending' && (
              <div className="shrink-0">
                <Button size="sm" variant="ghost" onClick={() => void onWithdraw(item)}>
                  <Undo2 /> 撤回
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
                    : 'text-muted-foreground hover:text-foreground'
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
                    <SelectValue />
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
                    <SelectValue />
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
                ...(canApprove ? [{ id: 'ledger', label: '审批台账' }] : []),
              ] as Array<{ id: 'mine' | 'pending' | 'ledger'; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400'
                    : 'text-muted-foreground hover:text-foreground'
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

          {/* 台账筛选：状态 + 处理月份（批过的单子不再从视野里消失） */}
          {tab === 'ledger' && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-700/60">
              {LEDGER_FILTERS.map((f) => (
                <button
                  key={f.id || 'all'}
                  onClick={() => setLedgerStatus(f.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    ledgerStatus === f.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <input
                type="month"
                value={ledgerMonth}
                onChange={(e) => setLedgerMonth(e.target.value)}
                aria-label="按处理月份筛选"
                className="ml-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200 dark:[color-scheme:dark]"
              />
            </div>
          )}

          {/* 批量决定工具条 */}
          {tab === 'pending' && selectable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-700/60 bg-zinc-50/60 dark:bg-zinc-900/30">
              <Checkbox
                id="select-all-pending"
                checked={selectedIds.length > 0 && selectedIds.length === selectable.length}
                onCheckedChange={() =>
                  setSelectedIds(
                    selectedIds.length === selectable.length ? [] : selectable.map((i) => i.id)
                  )
                }
              />
              <label htmlFor="select-all-pending" className="text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                全选（已选 {selectedIds.length} / {selectable.length}）
              </label>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                disabled={selectedItems.length === 0}
                onClick={() => openDecide(selectedItems)}
              >
                <CheckCircle2 /> 批量通过
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={selectedItems.length === 0}
                onClick={() => openDecide(selectedItems)}
              >
                <XCircle /> 批量驳回
              </Button>
            </div>
          )}

          {/* 我的调休余额：原来只在提交超额时以报错形式出现 */}
          {tab === 'mine' && balance && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-700/60 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">调休余额</span>
              <span className="font-medium text-zinc-900 dark:text-white tabular-nums">
                {balance.linked
                  ? `${balance.hours.toFixed(1)} 小时${balance.pendingHours > 0 ? `（待审占用 ${balance.pendingHours.toFixed(1)}）` : ''}`
                  : '账号未关联员工档案，无法计算'}
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">{renderList()}</div>
        </div>
      </div>

      {/* 决定对话框：通过/驳回都在这里有意见可写（驳回必填） */}
      <BaseModal
        isOpen={!!decideTarget}
        onClose={() => setDecideTarget(null)}
        title={
          (decideTarget?.length ?? 0) > 1
            ? `批量处理 ${decideTarget?.length} 条申请`
            : '审批决定'
        }
        size="md"
        footer={
          <>
            <Button
              variant="destructive"
              disabled={deciding}
              onClick={() => void submitDecide('rejected')}
            >
              <XCircle /> 驳回
            </Button>
            <Button disabled={deciding} onClick={() => void submitDecide('approved')}>
              {deciding ? <Clock className="animate-spin" /> : <CheckCircle2 />} 通过
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="max-h-40 overflow-auto space-y-1.5 text-sm">
            {(decideTarget ?? []).map((i) => (
              <li key={i.id} className="text-zinc-700 dark:text-zinc-200">
                {i.applicant} · {approvalTitle(i)} · {approvalSummary(i)}
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">事由：{i.reason}</span>
              </li>
            ))}
          </ul>
          <label className="block">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
              审批意见 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="text-muted-foreground">（驳回时必填）</span>
            </span>
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="例如：已与部门确认排班，准予；或说明驳回原因"
              className="field-sizing-fixed resize-y text-sm"
            />
          </label>
          {decideTarget && decideTarget.length === 1 && decideTarget[0].type === 'leave' && decideTarget[0].requiredRole === 'ADMIN' && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              该请假 ≥3 天，需管理员终审；当前账号若权限不足会被服务端拒绝。
            </p>
          )}
        </div>
      </BaseModal>
    </PageContainer>
  );
}
