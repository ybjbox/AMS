import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FolderArchive, Loader2, Printer, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import PageContainer from '@/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STORAGE_KEYS } from '@/config/constants';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { createBusinessFormRecord, polishFormBody } from '@/services/businessFormApi';
import { buildFormSheetCss, buildFormSheetHtml, openFormPrintWindow } from './lib/printHtml';
import { downloadFormDocx } from './lib/docxFile';
import { rmbUpper } from './lib/rmb';
import {
  RELATION_OPTIONS,
  TEMPLATES,
  buildBody,
  templateOf,
  type BusinessForm,
  type FormKind,
} from './lib/templates';

/** 预览按容器宽度等比缩放（A4 = 210×297mm ≈ 794×1123 CSS px） */
const SHEET_PX = { w: 793.7, h: 1122.5 };

const KINDS: Array<{ value: FormKind; label: string; hint: string }> = [
  ...TEMPLATES.map((t) => ({ value: t.kind as FormKind, label: t.label, hint: t.hint })),
  { value: 'custom', label: '自定义业务', hint: '沿用原件版式，正文自行填写' },
];

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function accountKeys(): Array<string | undefined> {
  try {
    const info = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_INFO) ?? '{}') as {
      username?: string;
      displayName?: string;
    };
    return [info.displayName, info.username];
  } catch {
    return [];
  }
}

export default function BusinessForms() {
  const { users, isLoading, initialized, fetchUsers } = useEmployeeStore();
  const [searchParams] = useSearchParams();
  /** 从员工档案「生成业务单」跳转进来时带上 employeeId，单据锁定该员工并可归档回档案 */
  const linkedEmployeeId = searchParams.get('employeeId') ?? '';
  const linkedEmployee = useMemo(
    () => (linkedEmployeeId ? (users.find((u) => u.id === linkedEmployeeId) ?? null) : null),
    [users, linkedEmployeeId]
  );
  const [kind, setKind] = useState<FormKind>('condolence');
  const [department, setDepartment] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState(RELATION_OPTIONS[0]);
  const [date, setDate] = useState(todayISO);
  const [amount, setAmount] = useState(TEMPLATES[0].amount);
  const [body, setBody] = useState('');
  /** 正文一旦被手工改过或润色过，就不再被模板覆盖（可用「恢复模板原文」重置） */
  const [bodyEdited, setBodyEdited] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'polish' | 'docx'>('idle');
  const [archiving, setArchiving] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [scale, setScale] = useState(1);
  const previewRef = useRef<HTMLDivElement>(null);

  const form: BusinessForm = useMemo(
    () => ({ kind, department, name, date, relation, amount, body }),
    [kind, department, name, date, relation, amount, body]
  );

  useEffect(() => {
    if (!initialized && !isLoading) void fetchUsers();
  }, [initialized, isLoading, fetchUsers]);

  // 深链带员工进来：申领人锁定为该员工，部门随之带出
  useEffect(() => {
    if (!linkedEmployee) return;
    setName(linkedEmployee.name);
    setDepartment(linkedEmployee.department);
    setBodyEdited(false);
  }, [linkedEmployee]);

  // 首次进入：用当前账号匹配员工档案，带出部门与姓名（深链场景已由上一段决定）
  useEffect(() => {
    if (linkedEmployeeId || users.length === 0 || name) return;
    for (const key of accountKeys()) {
      const hit = key ? users.find((u) => u.name === key) : undefined;
      if (hit) {
        setName(hit.name);
        setDepartment(hit.department);
        break;
      }
    }
  }, [users, name, linkedEmployeeId]);

  // 模板打底：未手工编辑正文时，正文随业务类型/人员/金额自动重建
  useEffect(() => {
    if (bodyEdited || !name) return;
    setBody(buildBody({ kind, department, name, date, relation, amount, body: '' }));
  }, [bodyEdited, kind, department, name, date, relation, amount]);

  const sheetCss = useMemo(() => buildFormSheetCss(), []);
  const sheetHtml = useMemo(() => buildFormSheetHtml(form), [form]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 8) / SHEET_PX.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pickEmployee = (value: string) => {
    setName(value);
    const hit = users.find((u) => u.name === value);
    if (hit) setDepartment(hit.department);
  };

  const onKindChange = (next: FormKind) => {
    setKind(next);
    const tpl = templateOf(next);
    if (tpl) setAmount(tpl.amount);
    setBodyEdited(false);
  };

  /** AI 润色（可选）：成功返回新正文，失败返回 null */
  const runPolish = useCallback(async (input: string): Promise<string | null> => {
    if (!input.trim()) {
      toast.error('请先填写正文');
      return null;
    }
    setBusy('polish');
    try {
      const res = await polishFormBody(input);
      setBody(res.text);
      setBodyEdited(true);
      return res.text;
    } catch (e) {
      const err = (e as { response?: { data?: { error?: string } }; message?: string }).response?.data
        ?.error;
      toast.error(err || (e as Error).message || '润色失败');
      return null;
    } finally {
      setBusy('idle');
    }
  }, []);

  const onPolishOnly = async () => {
    const out = await runPolish(body);
    if (out) toast.success('正文已按 AI 润色结果替换');
  };

  const onPrint = () => {
    if (!body.trim()) {
      toast.error('请先填写正文');
      return;
    }
    openFormPrintWindow(form);
  };

  const onDownload = async () => {
    if (!body.trim()) {
      toast.error('请先填写正文');
      return;
    }
    setBusy('docx');
    try {
      await downloadFormDocx(form, `业务单-${name || department || '未填'}-${date}`);
      toast.success('已下载 Word 文档');
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`);
    } finally {
      setBusy('idle');
    }
  };

  /** 归档：把这张单据记进该员工档案（每次点击存一份，改动正文后可再存） */
  const onArchive = async () => {
    if (!linkedEmployee) return;
    if (!body.trim()) {
      toast.error('请先填写正文');
      return;
    }
    setArchiving(true);
    try {
      await createBusinessFormRecord({
        employeeId: linkedEmployee.id,
        kind,
        kindLabel: KINDS.find((o) => o.value === kind)?.label ?? kind,
        department,
        relation: kind === 'condolence' ? relation : '',
        date,
        amount,
        body,
      });
      setArchivedCount((n) => n + 1);
      toast.success(`已记入 ${linkedEmployee.name} 的员工档案`);
    } catch (e) {
      const err = (e as { response?: { data?: { error?: string } }; message?: string }).response?.data
        ?.error;
      toast.error(err || (e as Error).message || '归档失败');
    } finally {
      setArchiving(false);
    }
  };

  const tpl = templateOf(kind);
  const upper = amount > 0 ? rmbUpper(amount) : '';

  return (
    <PageContainer width="6xl" className="space-y-6 animate-in fade-in duration-400">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">业务单据生成</h1>
          <p className="page-subtitle">
            {linkedEmployee
              ? `正在为 ${linkedEmployee.name}（${linkedEmployee.id}）生成单据，可存档到该员工档案。`
              : '沿用纸质《业务单》原件版式生成单据：选择业务类型自动填正文，可直接打印送签或下载 Word 文档继续编辑。'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">业务类型</span>
            <div
              className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
              role="radiogroup"
              aria-label="业务类型"
            >
              {KINDS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.value}
                  title={o.hint}
                  onClick={() => onKindChange(o.value)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    kind === o.value
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{KINDS.find((o) => o.value === kind)?.hint}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="form-name">
                申领人
              </label>
              <Input
                id="form-name"
                list={linkedEmployee ? undefined : 'form-employee-list'}
                value={name}
                onChange={(e) => pickEmployee(e.target.value)}
                placeholder="从员工档案选择或填写"
                maxLength={20}
                readOnly={!!linkedEmployee}
                aria-readonly={!!linkedEmployee}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="form-department">
                部门
              </label>
              <Input
                id="form-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="例如：集团办公室"
                maxLength={40}
              />
            </div>
            <datalist id="form-employee-list">
              {users.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.department}
                </option>
              ))}
            </datalist>

            {kind === 'condolence' && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">与员工关系</span>
                <Select value={relation} onValueChange={(v) => setRelation(String(v))}>
                  <SelectTrigger aria-label="与员工关系" className="w-full justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATION_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="form-date">
                单据日期
              </label>
              <Input
                id="form-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="dark:[color-scheme:dark]"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="form-amount">
                金额（元）
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="form-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-32 tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  {upper ? `大写：${upper}` : '本单据不涉及金额'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="form-body">
                需办理的业务（正文）
              </label>
              {tpl && bodyEdited && (
                <button
                  type="button"
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  onClick={() => setBodyEdited(false)}
                >
                  恢复模板原文
                </button>
              )}
            </div>
            <Textarea
              id="form-body"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setBodyEdited(true);
              }}
              placeholder="在此填写申请事由，一行一段…"
              className="min-h-40 resize-y text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onPrint}>
              <Printer className="h-4 w-4 mr-2" />
              打印
            </Button>
            <Button variant="outline" onClick={() => void onDownload()} disabled={busy !== 'idle'}>
              {busy === 'docx' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              下载 Word（.docx）
            </Button>
            {linkedEmployee && (
              <Button
                variant="outline"
                onClick={() => void onArchive()}
                disabled={busy !== 'idle' || archiving}
              >
                {archiving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FolderArchive className="h-4 w-4 mr-2" />
                )}
                存档到员工档案
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void onPolishOnly()} disabled={busy !== 'idle'}>
              {busy === 'polish' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              仅润色正文
            </Button>
            <span className="text-xs text-muted-foreground">润色会计入每日 AI 额度，可先看效果再打印</span>
          </div>

          {linkedEmployee && archivedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              已存档 {archivedCount} 份 ·{' '}
              <Link
                to={`/users?detail=${linkedEmployee.id}`}
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                查看该员工档案
              </Link>
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">A4 预览</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {scale < 1 ? `${Math.round(scale * 100)}%` : '100%'}
            </span>
          </div>
          <div ref={previewRef} className="overflow-auto rounded-xl border bg-muted/30 p-1">
            <div style={{ width: SHEET_PX.w * scale, height: SHEET_PX.h * scale }}>
              <div
                className="bg-white shadow-sm"
                style={{ width: SHEET_PX.w, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                // 预览与打印同源：版面 HTML/CSS 由 lib/printHtml 生成，正文经 escapeHtml 编码
                dangerouslySetInnerHTML={{ __html: `<style>${sheetCss}</style>${sheetHtml}` }}
              />
            </div>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
