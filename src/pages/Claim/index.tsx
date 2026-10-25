import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, KeyRound, Search, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_SYSTEM_ICON } from '@/config/constants';
import { claimApi, type ClaimLookupResult } from '@/services/claimApi';

/**
 * 认领账号（公开页，不需要登录）。
 *
 * 刻意只收四样：姓名、工号、手机尾号、用户名。身份证/住址这些档案里已经有的
 * 敏感字段，一律不接受前端提交——校验发生在 HR 当面核对那一步。
 */
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

const STEPS = [
  { title: '填写信息', desc: '姓名、工号、尾号' },
  { title: '当面核对', desc: '当面核对工号' },
  { title: '开通账号', desc: '拿到一次性口令' },
];

const NEXT_STEPS = [
  { icon: UserRoundCheck, title: '当面核对', desc: '管理员核对工号与手机尾号' },
  { icon: KeyRound, title: '拿到口令', desc: '一次性口令，只显示一次' },
  { icon: Clock3, title: '开通后登录', desc: '首次登录先改密，再进我的考勤' },
];

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-2xs text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-0.5">
          <label htmlFor={id} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {label}
          </label>
          {required && (
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </span>
        {hint && <span className="text-3xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

type ErrorKey = 'displayName' | 'employeeId' | 'phoneTail' | 'desiredUsername';

export default function ClaimAccount() {
  const [form, setForm] = useState({
    displayName: '',
    employeeId: '',
    phoneTail: '',
    desiredUsername: '',
    note: '',
  });
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<'form' | 'lookup'>('form');
  const [lookupForm, setLookupForm] = useState({ displayName: '', phoneTail: '' });
  const [lookupErrors, setLookupErrors] = useState<Partial<Record<'displayName' | 'phoneTail', string>>>({});
  const [looking, setLooking] = useState(false);
  const [lookupResult, setLookupResult] = useState<ClaimLookupResult | null>(null);
  const [lookupProblem, setLookupProblem] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const employeeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const lookupNameRef = useRef<HTMLInputElement>(null);
  const lookupPhoneRef = useRef<HTMLInputElement>(null);

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key !== 'note') {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  };

  const validate = (): Partial<Record<ErrorKey, string>> => {
    const next: Partial<Record<ErrorKey, string>> = {};
    if (!form.displayName.trim()) next.displayName = '请填姓名';
    if (!form.employeeId.trim()) next.employeeId = '请填工号，例如 EMP0012';
    if (!/^\d{4}$/.test(form.phoneTail)) next.phoneTail = '手机号后 4 位要填 4 位数字';
    if (!USERNAME_RE.test(form.desiredUsername.trim())) {
      next.desiredUsername = '用户名只能用字母、数字、点、下划线或连字符，3–32 位';
    }
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate();
    if (Object.keys(next).length) {
      setErrors(next);
      const order: Array<[ErrorKey, React.RefObject<HTMLInputElement | null>]> = [
        ['displayName', nameRef],
        ['employeeId', employeeRef],
        ['phoneTail', phoneRef],
        ['desiredUsername', usernameRef],
      ];
      order.find(([key]) => next[key])?.[1].current?.focus();
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await claimApi.submit({
        desiredUsername: form.desiredUsername.trim(),
        employeeId: form.employeeId.trim(),
        displayName: form.displayName.trim(),
        phoneTail: form.phoneTail.trim(),
        note: form.note.trim(),
      });
      setDone(true);
    } catch (err) {
      toast.error((err as { error?: string })?.error || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const openLookup = () => {
    setMode('lookup');
    setLookupForm({
      displayName: form.displayName.trim(),
      phoneTail: form.phoneTail.trim(),
    });
    setLookupErrors({});
    setLookupResult(null);
    setLookupProblem('');
  };

  const backToForm = () => {
    setMode('form');
    setLookupResult(null);
    setLookupProblem('');
    setLookupErrors({});
    if (lookupResult?.status === 'rejected') {
      setForm((f) => ({
        ...f,
        displayName: lookupForm.displayName.trim(),
        phoneTail: lookupForm.phoneTail.trim(),
        desiredUsername: lookupResult.desiredUsername,
      }));
    }
  };

  const runLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<'displayName' | 'phoneTail', string>> = {};
    if (!lookupForm.displayName.trim()) next.displayName = '请填姓名';
    if (!/^\d{4}$/.test(lookupForm.phoneTail)) next.phoneTail = '手机号后 4 位要填 4 位数字';
    if (Object.keys(next).length) {
      setLookupErrors(next);
      (next.displayName ? lookupNameRef : lookupPhoneRef).current?.focus();
      return;
    }

    setLookupErrors({});
    setLookupProblem('');
    setLooking(true);
    try {
      const result = await claimApi.lookup({
        displayName: lookupForm.displayName.trim(),
        phoneTail: lookupForm.phoneTail.trim(),
      });
      setLookupResult(result);
    } catch (err) {
      setLookupResult(null);
      setLookupProblem((err as { error?: string })?.error || '查询失败，请稍后重试');
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-zinc-50 dark:bg-zinc-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-24 size-64 rounded-full bg-brand-100/70 blur-3xl dark:bg-brand-900/20 lg:-right-32 lg:-top-32 lg:size-96" />
        <div className="absolute -left-24 top-1/3 size-64 rounded-full bg-emerald-100/50 blur-3xl dark:bg-emerald-900/10 lg:-left-32 lg:size-96" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-4 sm:max-w-xl sm:px-6 lg:max-w-6xl lg:px-8">
        <header className="flex items-center justify-between">
          <Link
            to="/login"
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-white/80 hover:text-brand-700 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-brand-300"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回登录
          </Link>
          <span className="text-2xs text-muted-foreground">员工自助</span>
        </header>

        <div className="flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-center lg:gap-16 lg:py-10">
          <section className="mt-3 lg:mt-0">
            <div className="flex items-center gap-3 lg:gap-4">
              <img
                src={DEFAULT_SYSTEM_ICON}
                alt=""
                className="h-10 w-10 shrink-0 object-contain lg:h-14 lg:w-14"
              />
              <div className="min-w-0">
                <p className="text-3xs tracking-[0.14em] text-muted-foreground lg:text-2xs">AMS · 员工门户</p>
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white lg:text-3xl">
                  {mode === 'lookup' ? '查询认领进度' : '认领我的账号'}
                </h1>
              </div>
            </div>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground lg:mt-4 lg:max-w-lg lg:text-base">
              {mode === 'lookup'
                ? '输入申请时填的姓名和手机尾号，查看现在到了哪一步。'
                : done
                  ? '管理员核对后会当面把一次性口令交给你。'
                  : '填好后由管理员当面核对。核对通过后账号即刻开通，第一次登录需要改成自己的口令。'}
            </p>

            {!done && mode === 'form' && (
              <ol
                className="mt-5 grid grid-cols-3 gap-2 lg:mt-8 lg:flex lg:flex-col lg:gap-5"
                aria-label="办理步骤"
              >
                {STEPS.map((s, i) => (
                  <li
                    key={s.title}
                    className="rounded-xl border border-zinc-200/70 bg-white/70 px-2 py-2.5 text-center dark:border-zinc-700/60 dark:bg-zinc-800/60 lg:flex lg:items-start lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left lg:dark:bg-transparent"
                  >
                    <span className="mx-auto flex size-6 items-center justify-center rounded-full bg-brand-600 text-3xs font-semibold text-white lg:mx-0 lg:size-8 lg:text-xs">
                      {i + 1}
                    </span>
                    <span className="mt-1.5 block lg:mt-0">
                      <span className="block text-2xs font-medium text-zinc-800 dark:text-zinc-100 lg:text-sm">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block text-3xs leading-snug text-muted-foreground lg:text-xs">
                        {s.desc}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-8 hidden items-start gap-3 rounded-card border border-zinc-200/70 bg-white/70 p-4 dark:border-zinc-700/60 dark:bg-zinc-800/60 lg:flex">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
                <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">当面核对后才开通</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  管理员核对工号和手机尾号；身份证、住址等档案已有的信息不会在这里收集。
                </p>
              </div>
            </div>
          </section>

          <section className="mt-4 lg:mt-0">
            {mode === 'lookup' ? (
              <div className="rounded-card border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800 lg:p-8">
                <div className="mb-4 flex items-baseline justify-between gap-2 sm:mb-5">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-white">申请进度</h2>
                  <button
                    type="button"
                    onClick={backToForm}
                    className="text-2xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    返回填写
                  </button>
                </div>

                {!lookupResult ? (
                  <form onSubmit={runLookup} noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="lookup-display-name" label="姓名" required error={lookupErrors.displayName}>
                        <Input
                          id="lookup-display-name"
                          ref={lookupNameRef}
                          value={lookupForm.displayName}
                          onChange={(e) => {
                            setLookupForm((f) => ({ ...f, displayName: e.target.value }));
                            setLookupErrors((v) => ({ ...v, displayName: undefined }));
                            setLookupProblem('');
                          }}
                          autoComplete="name"
                          placeholder="与申请时填的一致"
                          aria-invalid={!!lookupErrors.displayName}
                          aria-describedby={lookupErrors.displayName ? 'lookup-display-name-error' : undefined}
                          className="min-h-11"
                        />
                      </Field>

                      <Field
                        id="lookup-phone-tail"
                        label="手机号后 4 位"
                        hint="4 位数字"
                        required
                        error={lookupErrors.phoneTail}
                      >
                        <Input
                          id="lookup-phone-tail"
                          ref={lookupPhoneRef}
                          inputMode="numeric"
                          maxLength={4}
                          value={lookupForm.phoneTail}
                          onChange={(e) => {
                            setLookupForm((f) => ({ ...f, phoneTail: e.target.value.replace(/\D/g, '') }));
                            setLookupErrors((v) => ({ ...v, phoneTail: undefined }));
                            setLookupProblem('');
                          }}
                          aria-invalid={!!lookupErrors.phoneTail}
                          aria-describedby={lookupErrors.phoneTail ? 'lookup-phone-tail-error' : undefined}
                          className="min-h-11 tabular-nums"
                        />
                      </Field>
                    </div>

                    {lookupProblem && (
                      <p
                        role="alert"
                        className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
                      >
                        {lookupProblem}
                      </p>
                    )}

                    <Button type="submit" disabled={looking} className="mt-5 min-h-11 w-full">
                      {looking ? '查询中…' : '查询'}
                    </Button>
                    <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
                      查到的是用同一姓名和尾号提交的最近一条申请；不会显示一次性口令。
                    </p>
                  </form>
                ) : (
                  <div role="status" aria-live="polite">
                    {lookupResult.status === 'pending' && (
                      <div className="flex items-start gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/40">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-600 ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-amber-400 dark:ring-zinc-700">
                          <Clock3 className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white">还在等管理员核对</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            申请时间 {lookupResult.createdAt}。核对通过后会当面给一次性口令，不用重复提交。
                          </p>
                        </div>
                      </div>
                    )}

                    {lookupResult.status === 'approved' && (
                      <>
                        <div className="flex items-start gap-3 rounded-xl bg-emerald-50/70 p-4 dark:bg-emerald-500/10">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400">
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white">
                              {lookupResult.accountOpened ? '账号已开通' : '申请已通过，账号暂不可用'}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              用户名：<span className="font-medium text-zinc-700 dark:text-zinc-200">{lookupResult.desiredUsername}</span>。
                              {lookupResult.accountOpened
                                ? '首次登录需要改成自己的口令；忘记口令请让管理员重置。'
                                : '请联系管理员核对账号状态。'}
                            </p>
                          </div>
                        </div>
                        <Link
                          to="/login"
                          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                        >
                          去登录
                        </Link>
                      </>
                    )}

                    {lookupResult.status === 'rejected' && (
                      <>
                        <div className="flex items-start gap-3 rounded-xl bg-red-50/80 p-4 dark:bg-red-500/10">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-red-600 dark:bg-zinc-800 dark:text-red-400">
                            <AlertCircle className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white">申请未通过</p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                              {lookupResult.rejectReason || '管理员未填写原因，请当面询问。'}
                            </p>
                            {lookupResult.reviewedAt && (
                              <p className="mt-1 text-2xs text-muted-foreground">处理时间 {lookupResult.reviewedAt}</p>
                            )}
                          </div>
                        </div>
                        <Button type="button" onClick={backToForm} className="mt-5 min-h-11 w-full">
                          重新提交申请
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : done ? (
              <div className="rounded-card border border-zinc-200/70 bg-white p-6 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800 lg:p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
                    <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">已提交，等管理员核对</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    管理员会当面问你工号和手机尾号。开通后你会拿到一个一次性口令，第一次登录后请马上改成自己的。
                  </p>
                </div>

                <ol className="mt-5 space-y-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/40 lg:mt-6">
                  {NEXT_STEPS.map(({ icon: Icon, title, desc }, i) => (
                    <li key={title} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-brand-300 dark:ring-zinc-700">
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-100">
                          {i + 1}. {title}
                        </span>
                        <span className="mt-0.5 block text-2xs text-muted-foreground">{desc}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <button
                  type="button"
                  onClick={openLookup}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <Search className="size-4" aria-hidden="true" />
                  查询进度
                </button>

                <Link
                  to="/login"
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  返回登录页
                </Link>
              </div>
            ) : (
              <form
                onSubmit={submit}
                noValidate
                className="rounded-card border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800 lg:p-8"
              >
                <div className="mb-4 flex items-baseline justify-between gap-2 sm:mb-5">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-white">填写认领信息</h2>
                  <span className="text-2xs text-muted-foreground">带 * 为必填</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="claim-display-name" label="姓名" required error={errors.displayName}>
                    <Input
                      id="claim-display-name"
                      ref={nameRef}
                      value={form.displayName}
                      onChange={(e) => update('displayName', e.target.value)}
                      autoComplete="name"
                      aria-invalid={!!errors.displayName}
                      aria-describedby={errors.displayName ? 'claim-display-name-error' : undefined}
                      className="min-h-11"
                    />
                  </Field>

                  <Field id="claim-employee-id" label="工号" required error={errors.employeeId}>
                    <Input
                      id="claim-employee-id"
                      ref={employeeRef}
                      value={form.employeeId}
                      onChange={(e) => update('employeeId', e.target.value)}
                      placeholder="例如 EMP0012"
                      spellCheck={false}
                      aria-invalid={!!errors.employeeId}
                      aria-describedby={errors.employeeId ? 'claim-employee-id-error' : undefined}
                      className="min-h-11"
                    />
                  </Field>

                  <Field
                    id="claim-phone-tail"
                    label="手机号后 4 位"
                    hint="4 位数字"
                    required
                    error={errors.phoneTail}
                  >
                    <Input
                      id="claim-phone-tail"
                      ref={phoneRef}
                      inputMode="numeric"
                      maxLength={4}
                      value={form.phoneTail}
                      onChange={(e) => update('phoneTail', e.target.value.replace(/\D/g, ''))}
                      aria-invalid={!!errors.phoneTail}
                      aria-describedby={errors.phoneTail ? 'claim-phone-tail-error' : undefined}
                      className="min-h-11 tabular-nums"
                    />
                  </Field>

                  <Field
                    id="claim-username"
                    label="想用的用户名"
                    hint="3–32 位"
                    required
                    error={errors.desiredUsername}
                  >
                    <Input
                      id="claim-username"
                      ref={usernameRef}
                      value={form.desiredUsername}
                      onChange={(e) => update('desiredUsername', e.target.value)}
                      placeholder="字母、数字或 . _ -"
                      autoComplete="username"
                      spellCheck={false}
                      aria-invalid={!!errors.desiredUsername}
                      aria-describedby={errors.desiredUsername ? 'claim-username-error' : undefined}
                      className="min-h-11"
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field id="claim-note" label="备注" hint="可不填">
                      <Textarea
                        id="claim-note"
                        value={form.note}
                        onChange={(e) => update('note', e.target.value)}
                        rows={2}
                      />
                    </Field>
                  </div>
                </div>

                <Button type="submit" disabled={submitting} className="mt-5 min-h-11 w-full lg:mt-6">
                  {submitting ? '提交中…' : '提交，等管理员核对'}
                </Button>

                <button
                  type="button"
                  onClick={openLookup}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/20"
                >
                  <Search className="size-4" aria-hidden="true" />
                  已经提交过？查询进度
                </button>

                <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-muted-foreground lg:hidden">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  只收姓名、工号、手机尾号和用户名；身份证、住址等档案已有的信息不会在这里收集。
                </p>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
