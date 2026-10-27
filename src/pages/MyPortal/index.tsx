import { Pressable } from '@/components/ui/Pressable';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LogOut, Megaphone, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Badge from '@/components/ui/Badge';
import { FailedState } from '@/components/ui/FailedState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_USER_AVATAR } from '@/config/constants';
import { useUserStore } from '@/store/useUserStore';
import { useMotionPrefs } from '@/lib/motionTokens';
import { myApi, type MyAnomaly, type MySummary } from '@/services/myApi';
import { approvalApi, type Approval } from '@/services/approvalApi';
import { announcementApi, type Announcement } from '@/services/announcementApi';
import { readSummaryCache, writeSummaryCache } from './summaryCache';

/**
 * 员工门户。
 *
 * 回答四件事：这个月判了我什么、哪条不对我要提异议、我提的单到哪了、公司发了什么公告。
 * 与 HR 后台完全分开：路由 /my、底部四 Tab、文案不带任何引擎词汇。
 *
 * 布局：手机单列 + 底部 Tab；平板把结论与列表并排；桌面左侧身份/导航，右侧内容。
 */
type Tab = 'month' | 'anomalies' | 'notices' | 'me';

const TAB_LABEL: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'month', label: '本月', icon: CalendarDays },
  { id: 'anomalies', label: '异常', icon: Send },
  { id: 'notices', label: '公告', icon: Megaphone },
  { id: 'me', label: '我的', icon: User },
];

const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const STATUS_LABEL: Record<string, string> = {
  pending: '等 HR 处理',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
};

const formatCachedAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '上次加载';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function MyPortal() {
  const user = useUserStore((s) => s.userInfo);
  const logout = useUserStore((s) => s.logout);
  const { t, staggerDelay } = useMotionPrefs();

  const [tab, setTab] = useState<Tab>('month');
  const [month, setMonth] = useState(nowMonth());
  const [data, setData] = useState<MySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<Approval[]>([]);
  const [disputesError, setDisputesError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Announcement[]>([]);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [expandedNotice, setExpandedNotice] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<MyAnomaly | null>(null);
  const [form, setForm] = useState({ time: '', reason: '' });
  const [formErrors, setFormErrors] = useState<{ time?: string; reason?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const timeRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const owner = user?.username ?? '';
    try {
      const fresh = await myApi.summary(month);
      setData(fresh);
      setLoadError(null);
      setCachedAt(null);
      if (owner) writeSummaryCache(owner, month, fresh);
    } catch (e) {
      // 只有网络层失败才回退缓存：403/409/500 是服务端明确回答，不能被旧数据盖住
      const networkFailure = (e as { isAxiosError?: boolean })?.isAxiosError === true;
      const cached = owner ? readSummaryCache(owner, month) : null;
      if (networkFailure && cached) {
        setData(cached.data);
        setLoadError(null);
        setCachedAt(cached.at);
      } else {
        setLoadError((e as { error?: string })?.error || '数据没取到，请稍后重试');
      }
    } finally {
      setIsLoading(false);
    }
  }, [month, user?.username]);

  const loadDisputes = useCallback(async () => {
    try {
      setDisputes((await myApi.disputes()) as Approval[]);
      setDisputesError(null);
    } catch (e) {
      // 不能把"没取到"显示成"还没提过"——M1 那条错误在员工端不能再来一次
      setDisputesError((e as { error?: string })?.error || '我提过的异议没取到');
    }
  }, []);

  const loadNotices = useCallback(async () => {
    setNoticesLoading(true);
    try {
      setNotices(await announcementApi.list());
      setNoticesError(null);
    } catch (e) {
      // 公告没取到只能说没取到，不能显示成"还没有公告"
      setNoticesError((e as { error?: string })?.error || '公告没取到');
    } finally {
      setNoticesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadDisputes();
  }, [loadDisputes]);
  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const abnormalDays = useMemo(
    () => (data?.verdicts ?? []).filter((v) => v.hasIssue && !v.isLeave),
    [data]
  );
  const anomalies = data?.anomalies ?? [];
  const anomalyCount = anomalies.length;
  // 矩阵把「审批中心（我的申请）」关掉时，门户里的异议入口也要一起收起来，避免点了必 403
  const canDispute = user?.permissions?.includes('approvals:view') ?? false;
  // 同一天已有一条待审补卡时，按钮直接变成「已提交」，不让人重复点、等服务端 409
  const pendingDisputeDates = useMemo(
    () =>
      new Set(
        disputes
          .filter((d) => d.type === 'makeup' && d.status === 'pending')
          .map((d) => d.punchDate || d.startDate)
      ),
    [disputes]
  );

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const submitDispute = async () => {
    if (!disputeFor) return;
    const next: { time?: string; reason?: string } = {};
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) next.time = '请填打卡时间，例如 08:21';
    if (!form.reason.trim()) next.reason = '请写一句原因，HR 才知道怎么核对';
    if (next.time || next.reason) {
      setFormErrors(next);
      (next.time ? timeRef : reasonRef).current?.focus();
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      await approvalApi.create({
        type: 'makeup',
        punchDate: disputeFor.date,
        punchTime: form.time,
        punchKind:
          disputeFor.type.startsWith('LATE') || disputeFor.type === 'MISSING_IN' ? '上班卡' : '下班卡',
        reason: form.reason.trim(),
      });
      toast.success('已提交，等 HR 处理');
      setDisputeFor(null);
      setForm({ time: '', reason: '' });
      setFormErrors({});
      await loadDisputes();
      setTab('me');
    } catch (e) {
      toast.error((e as { error?: string })?.error || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-zinc-50 dark:bg-zinc-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-24 hidden size-64 rounded-full bg-brand-100/60 blur-3xl dark:bg-brand-900/20 lg:block lg:size-96" />
        <div className="absolute -left-24 top-1/3 hidden size-64 rounded-full bg-emerald-100/40 blur-3xl dark:bg-emerald-900/10 lg:block lg:size-96" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col sm:max-w-2xl lg:max-w-6xl lg:flex-row lg:items-start lg:gap-8 lg:px-8 lg:py-8">
        <aside className="hidden lg:sticky lg:top-8 lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:gap-4 lg:self-start">
          <div className="rounded-card border border-zinc-200/60 bg-white p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800">
            <div className="flex items-center gap-3">
              <img
                src={user?.avatar || DEFAULT_USER_AVATAR}
                alt=""
                className="size-11 shrink-0 rounded-full object-cover ring-1 ring-zinc-200/70 dark:ring-zinc-700"
              />
              <div className="min-w-0">
                <p className="text-2xs text-muted-foreground">我的考勤</p>
                <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                  {user?.displayName || user?.username || '我'}
                </h1>
              </div>
            </div>
            <dl className="mt-4 space-y-1.5 text-2xs">
              <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
                <dt>工号</dt>
                <dd className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">{data?.employeeId ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
                <dt>数据截止</dt>
                <dd className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
                  {data?.coverage.latestDate ?? '—'}
                </dd>
              </div>
              {data && data.coverage.uncoveredDays > 0 && (
                <div className="flex items-baseline justify-between gap-2 text-amber-700 dark:text-amber-400">
                  <dt>没算进来</dt>
                  <dd className="font-mono tabular-nums">{data.coverage.uncoveredDays} 天</dd>
                </div>
              )}
            </dl>
          </div>

          <nav
            className="rounded-card border border-zinc-200/60 bg-white p-2 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800"
            aria-label="员工门户导航"
          >
            {TAB_LABEL.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <Pressable
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'text-muted-foreground hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-700/40 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                  {item.id === 'anomalies' && anomalyCount > 0 && (
                    <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-3xs leading-4 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      {anomalyCount}
                    </span>
                  )}
                </Pressable>
              );
            })}
          </nav>

          <div className="rounded-card border border-zinc-200/60 bg-white p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800">
            <p className="text-2xs text-muted-foreground">当前账号</p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-white">{user?.username}</p>
            <Button
              variant="ghost"
              className="mt-2 min-h-11 w-full justify-start px-2 text-sm text-zinc-600 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400"
              onClick={handleLogout}
            >
              <LogOut className="size-4" /> 退出登录
            </Button>
          </div>
        </aside>

        <div className="flex min-h-dvh flex-1 flex-col lg:min-h-0">
          <header className="sticky top-0 z-10 border-b border-zinc-200/60 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-800/95 sm:px-6 lg:hidden">
            <p className="text-2xs text-muted-foreground">我的考勤</p>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-white">
              {user?.displayName || user?.username || '我'}
            </h1>
            {data && (
              <p className="data-rise-in mt-0.5 text-2xs text-muted-foreground font-mono tabular-nums">
                数据截止 {data.coverage.latestDate ?? '—'}
                {data.coverage.uncoveredDays > 0 && ` · 本月还有 ${data.coverage.uncoveredDays} 天没算进来`}
              </p>
            )}
          </header>

          <main className="flex-1 px-4 py-4 sm:px-6 lg:px-0 lg:py-0">
            {cachedAt && !isLoading && !loadError && (
              <p
                role="status"
                className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-2xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              >
                当前离线，显示的是上次加载的结果（{formatCachedAt(cachedAt)}）。
              </p>
            )}
            {/* Tab 切换：交叉淡入 120ms，不做方向转场（四个 Tab 是并列的，横滑会暗示顺序） */}
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t(0.12)}
              className="space-y-4"
            >
              {isLoading ? (
                <div className="space-y-4" aria-busy="true">
                  <span className="sr-only">加载中…</span>
                  <div className="portal-summary-grid grid gap-4 md:items-start">
                    <Skeleton className="h-40 rounded-card" />
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-14 rounded-card" />
                      ))}
                    </div>
                  </div>
                </div>
              ) : loadError ? (
                <FailedState subject="我的考勤" reason={loadError} onRetry={() => void load()} retryClassName="min-h-11" />
              ) : tab === 'month' ? (
                <div className="portal-summary-grid grid gap-4 md:items-start">
                  <div className="space-y-4 lg:sticky lg:top-8">
                    <motion.section
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={t(0.22)}
                      className="rounded-card border border-zinc-200/60 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-800 lg:p-5"
                    >
                      <div className="flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="上个月"
                          className="min-h-11 min-w-11"
                          onClick={() => setMonth((m) => shiftMonth(m, -1))}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm font-semibold font-mono tabular-nums text-zinc-900 dark:text-white">{month}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="下个月"
                          className="min-h-11 min-w-11"
                          onClick={() => setMonth((m) => shiftMonth(m, 1))}
                          disabled={month >= nowMonth()}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-2xs text-muted-foreground">迟到</p>
                          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-zinc-900 dark:text-white lg:text-3xl">
                            {data?.counts.late ?? 0}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">次</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-2xs text-muted-foreground">缺卡</p>
                          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-zinc-900 dark:text-white lg:text-3xl">
                            {data?.counts.missing ?? 0}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">次</span>
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        已核对 {data?.coverage.coveredDays ?? 0} 天 / 本月已过 {data?.coverage.elapsedDays ?? 0} 天
                      </p>
                    </motion.section>

                    <p className="hidden text-2xs leading-relaxed text-muted-foreground md:block">
                      点开某一天可以看依据；判得不对，到「异常」提异议。
                    </p>
                  </div>

                  <div>
                    <div className="mb-3 hidden items-baseline justify-between md:flex">
                      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">需要处理的日子</h2>
                      <span className="text-2xs text-muted-foreground font-mono tabular-nums">{abnormalDays.length} 天</span>
                    </div>

                    {abnormalDays.length === 0 ? (
                      <EmptyState title="今天之前都算正常" description="有新数据或新的判定后，会出现在这里。" icon={CalendarDays} />
                    ) : (
                      <ul className="space-y-2">
                        {abnormalDays.map((v, i) => (
                          <motion.li
                            key={v.date}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...t(0.2), delay: staggerDelay(i) }}
                            className="rounded-card border border-zinc-200/60 bg-white dark:border-zinc-700/60 dark:bg-zinc-800"
                          >
                            <Pressable
                              type="button"
                              aria-expanded={expanded === v.date}
                              onClick={() => setExpanded((prev) => (prev === v.date ? null : v.date))}
                              className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left"
                            >
                              <span className="text-sm font-medium font-mono tabular-nums text-zinc-900 dark:text-white">{v.date}</span>
                              <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                                {v.verdict}
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${expanded === v.date ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                />
                              </span>
                            </Pressable>
                            {expanded === v.date && (
                              <p className="soft-rise-in px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                                {v.why || '这条没有留下依据说明。'}
                              </p>
                            )}
                          </motion.li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : tab === 'anomalies' ? (
                <>
                  <div className="hidden items-baseline justify-between md:flex">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-white">我的异常</h2>
                    <span className="text-2xs text-muted-foreground font-mono tabular-nums">{anomalyCount} 条</span>
                  </div>

                  {anomalyCount === 0 ? (
                    <EmptyState
                      title="这个月没有要处理的事"
                      description="被判异常的日子会出现在这里，而且可以直接提异议。"
                      icon={Send}
                    />
                  ) : (
                    <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                      {anomalies.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-card border border-zinc-200/60 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-800"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <span className="whitespace-nowrap text-sm font-medium font-mono tabular-nums">{a.date}</span>
                            <Badge variant="warning" className="max-w-full text-left">
                              {a.description}
                            </Badge>
                          </div>
                          {disputeFor?.id === a.id ? (
                            <div className="mt-3 space-y-2">
                              <div>
                                <Input
                                  ref={timeRef}
                                  value={form.time}
                                  onChange={(e) => {
                                    setForm((f) => ({ ...f, time: e.target.value }));
                                    setFormErrors((f) => ({ ...f, time: undefined }));
                                  }}
                                  placeholder="那天几点打的卡，例如 08:21"
                                  inputMode="numeric"
                                  aria-label="打卡时间"
                                  aria-invalid={!!formErrors.time}
                                  aria-describedby={formErrors.time ? 'dispute-time-error' : undefined}
                                  className="min-h-11"
                                />
                                {formErrors.time && (
                                  <p id="dispute-time-error" role="alert" className="mt-1 text-2xs text-red-600 dark:text-red-400">
                                    {formErrors.time}
                                  </p>
                                )}
                              </div>
                              <div>
                                <Textarea
                                  ref={reasonRef}
                                  value={form.reason}
                                  onChange={(e) => {
                                    setForm((f) => ({ ...f, reason: e.target.value }));
                                    setFormErrors((f) => ({ ...f, reason: undefined }));
                                  }}
                                  rows={2}
                                  placeholder="一句原因，比如：那天替人顶班"
                                  aria-label="原因"
                                  aria-invalid={!!formErrors.reason}
                                  aria-describedby={formErrors.reason ? 'dispute-reason-error' : undefined}
                                  className="min-h-11"
                                />
                                {formErrors.reason && (
                                  <p id="dispute-reason-error" role="alert" className="mt-1 text-2xs text-red-600 dark:text-red-400">
                                    {formErrors.reason}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button onClick={() => void submitDispute()} disabled={submitting} className="min-h-11 flex-1">
                                  {submitting ? '提交中…' : '提交'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setDisputeFor(null);
                                    setFormErrors({});
                                  }}
                                  className="min-h-11"
                                >
                                  取消
                                </Button>
                              </div>
                            </div>
                          ) : canDispute ? (
                            pendingDisputeDates.has(a.date) ? (
                              <p className="mt-3 text-2xs text-muted-foreground">已提交，等 HR 处理。</p>
                            ) : (
                              <Button
                                variant="secondary"
                                className="mt-3 min-h-11 w-full"
                                onClick={() => {
                                  setDisputeFor(a);
                                  setForm({ time: a.suggestedTime ?? '', reason: '' });
                                  setFormErrors({});
                                }}
                              >
                                对此提异议
                              </Button>
                            )
                          ) : (
                            <p className="mt-3 text-2xs text-muted-foreground">管理员暂未开放异议提交。</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : tab === 'notices' ? (
                <>
                  <div className="hidden items-baseline justify-between md:flex">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-white">公告</h2>
                    <span className="text-2xs text-muted-foreground font-mono tabular-nums">{notices.length} 条</span>
                  </div>

                  {noticesLoading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">加载中…</p>
                  ) : noticesError ? (
                    <FailedState
                      subject="公告"
                      reason={noticesError}
                      onRetry={() => void loadNotices()}
                      retryClassName="min-h-11"
                    />
                  ) : notices.length === 0 ? (
                    <EmptyState
                      title="还没有公告"
                      description="公司发布的通知会出现在这里。"
                      icon={Megaphone}
                    />
                  ) : (
                    <ul className="space-y-3">
                      {notices.map((n) => {
                        const open = expandedNotice === n.id;
                        const long = n.content.length > 120;
                        return (
                          <li
                            key={n.id}
                            className="rounded-card border border-zinc-200/60 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-800 lg:p-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{n.title}</h3>
                              {n.priority === 'important' && <Badge variant="warning">重要</Badge>}
                            </div>
                            <p className="mt-1 text-2xs text-muted-foreground font-mono tabular-nums">
                              {n.createdAt.slice(0, 10)}
                              {n.expiresAt && ` · 有效至 ${n.expiresAt}`}
                            </p>
                            {n.content && (
                              <>
                                <p
                                  className={`mt-2 whitespace-pre-line text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 ${
                                    open ? '' : 'line-clamp-3'
                                  }`}
                                >
                                  {n.content}
                                </p>
                                {long && (
                                  <Pressable
                                    type="button"
                                    onClick={() => setExpandedNotice(open ? null : n.id)}
                                    className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                                  >
                                    {open ? '收起' : '展开全文'}
                                  </Pressable>
                                )}
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <div className="hidden items-baseline justify-between md:flex">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-white">我的异议</h2>
                    <span className="text-2xs text-muted-foreground font-mono tabular-nums">{disputes.length} 条</span>
                  </div>

                  <section className="space-y-2 rounded-card border border-zinc-200/60 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-800 lg:p-5">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white lg:hidden">我提过的异议</p>
                    {disputesError ? (
                      <FailedState
                        subject="我提过的异议"
                        reason={disputesError}
                        onRetry={() => void loadDisputes()}
                        retryClassName="min-h-11"
                      />
                    ) : disputes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">还没有提过。判得不对的那天，在「异常」里点一下就能提。</p>
                    ) : (
                      <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                        {disputes.map((d) => (
                          <li key={d.id} className="py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-mono tabular-nums">{d.startDate}</span>
                              <Badge
                                variant={
                                  d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'destructive' : 'warning'
                                }
                              >
                                {STATUS_LABEL[d.status] ?? d.status}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-2xs text-muted-foreground">{d.reason}</p>
                            {d.status === 'rejected' && d.comment && (
                              <p className="mt-0.5 text-2xs text-muted-foreground">HR 回复：{d.comment}</p>
                            )}
                            {d.type === 'makeup' && d.status === 'approved' && d.recomputeOk === 1 && (
                              <p className="mt-1 text-2xs text-emerald-700 dark:text-emerald-400">
                                补卡已通过，结论已更新。
                              </p>
                            )}
                            {d.type === 'makeup' && d.status === 'approved' && d.recomputeOk === 0 && (
                              <p className="mt-1 text-2xs text-amber-700 dark:text-amber-400">
                                补卡已通过，但结论还没更新；HR 会再核对一次。
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <div className="space-y-4 lg:hidden">
                    <section className="space-y-1 rounded-card border border-zinc-200/60 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-800">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">账号</p>
                      <p className="text-xs text-muted-foreground">用户名 {user?.username}</p>
                      <p className="text-xs text-muted-foreground font-mono tabular-nums">工号 {data?.employeeId ?? '未绑定'}</p>
                    </section>

                    <Button variant="secondary" className="min-h-11 w-full" onClick={handleLogout}>
                      <LogOut className="size-4" /> 退出登录
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </main>

          <nav
            className="sticky bottom-0 border-t border-zinc-200/60 bg-white/95 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-800/95 lg:hidden"
            aria-label="员工门户导航"
          >
            <div className="flex">
              {TAB_LABEL.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <Pressable
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-2xs ${
                      active ? 'text-brand-600 dark:text-brand-400' : 'text-muted-foreground'
                    }`}
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </Pressable>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
