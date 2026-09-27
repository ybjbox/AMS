import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, Download, FolderArchive, Loader2, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageContainer from '@/components/PageContainer';
import { PreviewZoomControl } from '@/components/PreviewZoomControl';
import { usePreviewZoom } from '@/hooks/usePreviewZoom';
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
import { planSheets, type SheetSlot } from './lib/sheetLayout';
import { rmbUpper } from './lib/rmb';
import {
  duplicateAsNew,
  formOf,
  newItem,
  patchItem,
  setItemKind,
  syncBody,
  type BusinessFormItem,
} from './lib/items';
import { RELATION_OPTIONS, TEMPLATES, templateOf, type FormKind } from './lib/templates';

/** 预览按容器宽度等比缩放（A4 = 210×297mm ≈ 794×1123 CSS px） */
const SHEET_PX = { w: 793.7, h: 1122.5 };

const KINDS: Array<{ value: FormKind; label: string; hint: string }> = [
  ...TEMPLATES.map((t) => ({ value: t.kind as FormKind, label: t.label, hint: t.hint })),
  { value: 'custom', label: '自定义业务', hint: '沿用原件版式，正文自行填写' },
];

const kindLabel = (kind: FormKind) => KINDS.find((o) => o.value === kind)?.label ?? kind;

const listNos = (nos: Array<number | string>) => nos.join('、');

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

/** 每张纸的角标：这一张上是哪几条、有没有补位的空白单 */
function sheetCaption(sheet: SheetSlot[], no: number): string {
  const parts = sheet.map((s) => (s.blank ? '空白单' : s.form.name.trim() || '未填姓名'));
  return `第 ${no} 张 · ${parts.join(' + ')}`;
}

export default function BusinessForms() {
  const { users, isLoading, initialized, fetchUsers } = useEmployeeStore();
  const [searchParams] = useSearchParams();
  /** 从员工档案「生成业务单」跳转进来时带上 employeeId，第一条锁定该员工并可归档回档案 */
  const linkedEmployeeId = searchParams.get('employeeId') ?? '';
  const linkedEmployee = useMemo(
    () => (linkedEmployeeId ? (users.find((u) => u.id === linkedEmployeeId) ?? null) : null),
    [users, linkedEmployeeId]
  );

  const [items, setItems] = useState<BusinessFormItem[]>(() => [newItem()]);
  /** 润色按条计额度、按条改正文，所以哪一条在润色要单独记 */
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'docx'>('idle');
  const [archiving, setArchiving] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [scale, setScale] = useState(1);
  /** 容器自适应比例 × 用户手动缩放比例（100% = 只看容器自适应） */
  const { zoom, change, reset } = usePreviewZoom('business-forms');
  const fit = (scale * zoom) / 100;
  const previewRef = useRef<HTMLDivElement>(null);
  const seededLinked = useRef(false);

  useEffect(() => {
    if (!initialized && !isLoading) void fetchUsers();
  }, [initialized, isLoading, fetchUsers]);

  // 深链带员工进来：第一条锁定为该员工，部门随之带出（其余条目仍可自由添加）
  useEffect(() => {
    if (!linkedEmployee || seededLinked.current) return;
    seededLinked.current = true;
    setItems((prev) =>
      prev.map((it, i) =>
        i === 0
          ? syncBody({
              ...it,
              locked: true,
              name: linkedEmployee.name,
              department: linkedEmployee.department,
              bodyEdited: false,
            })
          : it
      )
    );
  }, [linkedEmployee]);

  // 首次进入：用当前账号匹配员工档案，带出部门与姓名（深链场景已由上一段决定）
  useEffect(() => {
    if (linkedEmployeeId || users.length === 0) return;
    setItems((prev) => {
      if (prev[0].name) return prev;
      for (const key of accountKeys()) {
        const hit = key ? users.find((u) => u.name === key) : undefined;
        if (hit) {
          return [
            syncBody({ ...prev[0], name: hit.name, department: hit.department, bodyEdited: false }),
            ...prev.slice(1),
          ];
        }
      }
      return prev;
    });
  }, [users, linkedEmployeeId]);

  /** 排版判定与预览/打印共用：一张纸固定上下两格，尾格补空白单 */
  const plan = useMemo(() => planSheets(items.map(formOf)), [items]);
  const sheetCss = useMemo(() => buildFormSheetCss(), []);
  const sheetHtmls = useMemo(() => plan.sheets.map((sheet) => buildFormSheetHtml(sheet)), [plan]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 16) / SHEET_PX.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const update = (id: string, patch: Parameters<typeof patchItem>[1]) =>
    setItems((prev) => prev.map((it) => (it.id === id ? patchItem(it, patch) : it)));

  /** 申领人改名时顺带带出部门（与员工档案一致） */
  const pickEmployee = (id: string, value: string) => {
    const hit = users.find((u) => u.name === value);
    update(id, hit ? { name: value, department: hit.department } : { name: value });
  };

  const changeKind = (id: string, kind: FormKind) =>
    setItems((prev) => prev.map((it) => (it.id === id ? setItemKind(it, kind) : it)));

  /** 新增：日期取当天，部门沿用最后一条（一批单据通常出自同一个部门） */
  const addBlank = () =>
    setItems((prev) => [...prev, newItem({ department: prev[prev.length - 1]?.department })]);

  const addFrom = (id: string) =>
    setItems((prev) => {
      const src = prev.find((it) => it.id === id);
      return src ? [...prev, duplicateAsNew(src)] : prev;
    });

  const removeItem = (id: string) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));

  const restoreTemplate = (id: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? syncBody({ ...it, bodyEdited: false }) : it)));

  /** AI 润色（可选，按条触发）：只改这一条的正文 */
  const onPolish = useCallback(async (item: BusinessFormItem) => {
    if (!item.body.trim()) {
      toast.error('请先填写正文');
      return;
    }
    setPolishingId(item.id);
    try {
      const res = await polishFormBody(item.body);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, body: res.text, bodyEdited: true } : it))
      );
      toast.success('正文已按 AI 润色结果替换');
    } catch (e) {
      const err = (e as { response?: { data?: { error?: string } }; message?: string }).response?.data
        ?.error;
      toast.error(err || (e as Error).message || '润色失败');
    } finally {
      setPolishingId(null);
    }
  }, []);

  /** 空正文的条目序号（1 基）：打印与导出前必须补齐，否则会打出没有内容的纸 */
  const blankNos = useMemo(
    () => items.map((it, i) => (it.body.trim() ? 0 : i + 1)).filter((n) => n > 0),
    [items]
  );
  const missingBody = () => toast.error(`第 ${listNos(blankNos)} 条还没有正文`);

  const employeeOf = (name: string) => users.find((u) => u.name === name.trim()) ?? null;
  /** 归档只认与员工档案同名的申领人；认不出或没正文的条目不算 */
  const archivableNos = items
    .map((it, i) => (employeeOf(it.name) && it.body.trim() ? i + 1 : 0))
    .filter((n) => n > 0);

  const onPrint = () => {
    if (blankNos.length) {
      missingBody();
      return;
    }
    // 与预览同一份版面：同一个 plan.sheets
    openFormPrintWindow(plan.sheets);
  };

  const onDownload = async () => {
    if (blankNos.length) {
      missingBody();
      return;
    }
    setBusy('docx');
    const first = items[0];
    const filename =
      items.length === 1
        ? `业务单-${first.name || first.department || '未填'}-${first.date}`
        : `业务单-${items.length}条-${first.date}`;
    try {
      await downloadFormDocx(items.map(formOf), filename);
      toast.success(`已下载 Word 文档（${items.length} 页，一页一条）`);
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`);
    } finally {
      setBusy('idle');
    }
  };

  /** 归档：按条记进各自申领人的员工档案，成功 / 跳过 / 失败各报各的数 */
  const onArchive = async () => {
    if (!archivableNos.length) {
      toast.error('没有可归档的条目：申领人要与员工档案同名，且正文不为空');
      return;
    }
    setArchiving(true);
    let saved = 0;
    const failed: string[] = [];
    for (const [i, it] of items.entries()) {
      if (!archivableNos.includes(i + 1)) continue;
      const emp = employeeOf(it.name);
      if (!emp) continue;
      try {
        await createBusinessFormRecord({
          employeeId: emp.id,
          kind: it.kind,
          kindLabel: kindLabel(it.kind),
          department: it.department,
          relation: it.kind === 'condolence' ? it.relation : '',
          date: it.date,
          amount: it.amount,
          body: it.body,
        });
        saved += 1;
      } catch (e) {
        const err = (e as { response?: { data?: { error?: string } }; message?: string }).response?.data
          ?.error;
        failed.push(`${it.name}：${err || (e as Error).message || '归档失败'}`);
      }
    }
    setArchiving(false);
    const skipped = items.length - archivableNos.length;
    if (saved) {
      setArchivedCount((n) => n + saved);
      toast.success(
        `已记入 ${saved} 条员工档案${skipped ? `，另有 ${skipped} 条未匹配到同名员工、未归档` : ''}`
      );
    }
    if (failed.length) toast.error(`归档失败：${failed.join('；')}`);
  };

  return (
    <PageContainer width="6xl" className="space-y-6 animate-in fade-in duration-400">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">业务单据生成</h1>
          <p className="page-subtitle">
            {linkedEmployee
              ? `正在为 ${linkedEmployee.name}（${linkedEmployee.id}）生成单据，可存档到该员工档案；需要给别人开单时继续添加即可。`
              : '沿用纸质《业务单》原件版式生成单据：可一次添加多条，打印时按张连续排版，尾格打空白单。'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* 左列自己滚 + 吸顶：条目会越加越多，不能让它把整页撑出画面（2026-09-27 反馈）。
            上限按"视口减去标题区与容器内边距"给，比预览框的 70vh 略高一点，
            两列都在自己那格里滚，整页始终不出现滚动条。 */}
        <section className="self-start space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
          {items.map((item, i) => {
            const tpl = templateOf(item.kind);
            const upper = item.amount > 0 ? rmbUpper(item.amount) : '';
            const nameId = `form-name-${item.id}`;
            const deptId = `form-department-${item.id}`;
            const dateId = `form-date-${item.id}`;
            const amountId = `form-amount-${item.id}`;
            const bodyId = `form-body-${item.id}`;
            return (
              <article key={item.id} className="space-y-3 rounded-xl border bg-card p-3">
                <header className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    第 {i + 1} 条
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {kindLabel(item.kind)}
                      {item.amount > 0 ? ` · ${item.amount} 元` : ''}
                    </span>
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addFrom(item.id)}
                      title="沿用这一条的业务类型、金额、部门与日期再开一条（申领人与正文留空）"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      沿用新增
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      title={items.length === 1 ? '至少要留一条' : '删除这一条'}
                      aria-label={`删除第 ${i + 1} 条业务单`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </header>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">业务类型</span>
                  <div
                    className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
                    role="radiogroup"
                    aria-label={`第 ${i + 1} 条的业务类型`}
                  >
                    {KINDS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={item.kind === o.value}
                        title={o.hint}
                        onClick={() => changeKind(item.id, o.value)}
                        className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                          item.kind === o.value
                            ? 'bg-background font-medium text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={nameId}>
                      申领人
                    </label>
                    <Input
                      id={nameId}
                      list={item.locked ? undefined : 'form-employee-list'}
                      value={item.name}
                      onChange={(e) => pickEmployee(item.id, e.target.value)}
                      placeholder="从员工档案选择或填写"
                      maxLength={20}
                      readOnly={item.locked}
                      aria-readonly={item.locked}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={deptId}>
                      部门
                    </label>
                    <Input
                      id={deptId}
                      value={item.department}
                      onChange={(e) => update(item.id, { department: e.target.value })}
                      placeholder="例如：集团办公室"
                      maxLength={40}
                    />
                  </div>

                  {item.kind === 'condolence' && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">与员工关系</span>
                      <Select
                        value={item.relation}
                        onValueChange={(v) => update(item.id, { relation: String(v) })}
                      >
                        <SelectTrigger
                          aria-label={`第 ${i + 1} 条的与员工关系`}
                          className="w-full justify-between"
                        >
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
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={dateId}>
                      单据日期
                    </label>
                    <Input
                      id={dateId}
                      type="date"
                      value={item.date}
                      onChange={(e) => update(item.id, { date: e.target.value })}
                      className="dark:[color-scheme:dark]"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={amountId}>
                      金额（元）
                    </label>
                    <div className="flex items-center gap-3">
                      <Input
                        id={amountId}
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.amount}
                        onChange={(e) =>
                          update(item.id, { amount: Math.max(0, Number(e.target.value) || 0) })
                        }
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
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={bodyId}>
                      需办理的业务（正文）
                    </label>
                    {tpl && item.bodyEdited && (
                      <button
                        type="button"
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                        onClick={() => restoreTemplate(item.id)}
                      >
                        恢复模板原文
                      </button>
                    )}
                  </div>
                  <Textarea
                    id={bodyId}
                    value={item.body}
                    onChange={(e) => update(item.id, { body: e.target.value })}
                    placeholder="在此填写申请事由，一行一段…"
                    className="min-h-28 resize-y text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void onPolish(item)}
                    disabled={busy !== 'idle' || polishingId !== null}
                  >
                    {polishingId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                    )}
                    仅润色这一条
                  </Button>
                </div>
              </article>
            );
          })}

          <datalist id="form-employee-list">
            {users.map((u) => (
              <option key={u.id} value={u.name}>
                {u.department}
              </option>
            ))}
          </datalist>

          <Button variant="outline" className="w-full" onClick={addBlank}>
            <Plus className="h-4 w-4 mr-2" />
            添加一条业务单
          </Button>

          {/* 一张纸固定上下两条：没有开关，尾格自动补一张空白单（对折即裁线） */}
          <p className="text-xs text-muted-foreground" aria-live="polite">
            共 {plan.itemCount} 条 · {plan.sheets.length} 张纸（上下两条一张，尾格打空白单）
            {plan.oversized.length > 0 &&
              ` · 第 ${listNos(plan.oversized.map((o) => o.no))} 条正文约 ${listNos(
                plan.oversized.map((o) => String(o.lines))
              )} 行，半页装不下，已各自独占一张（不缩放）`}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onPrint}>
              <Printer className="h-4 w-4 mr-2" />
              打印 {plan.sheets.length} 张
            </Button>
            <Button variant="outline" onClick={() => void onDownload()} disabled={busy !== 'idle'}>
              {busy === 'docx' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              下载 Word（.docx）
            </Button>
            {archivableNos.length > 0 && (
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
                存档到员工档案（{archivableNos.length} 条）
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">润色按条计入每日 AI 额度，可先看效果再打印。</p>

          {archivedCount > 0 && linkedEmployee && (
            <p className="text-xs text-muted-foreground">
              已存档 {archivedCount} 条 ·{' '}
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
            <h2 className="section-title">A4 预览（{plan.sheets.length} 张）</h2>
            <PreviewZoomControl zoom={zoom} onChange={change} onReset={reset} />
          </div>
          <div
            ref={previewRef}
            role="region"
            aria-label="业务单预览区"
            className="max-h-[70vh] space-y-3 overflow-auto rounded-xl border bg-muted/30 p-2"
          >
            {plan.sheets.map((sheet, i) => (
              <div key={i}>
                <p className="mb-1 text-2xs text-muted-foreground">{sheetCaption(sheet, i + 1)}</p>
                <div style={{ width: SHEET_PX.w * fit, height: SHEET_PX.h * fit }}>
                  <div
                    className="bg-white shadow-sm"
                    style={{
                      width: SHEET_PX.w,
                      transform: `scale(${fit})`,
                      transformOrigin: 'top left',
                    }}
                    // 预览与打印同源：版面 HTML/CSS 由 lib/printHtml 生成，正文经 escapeHtml 编码
                    dangerouslySetInnerHTML={{
                      __html: `<style>${sheetCss}</style>${sheetHtmls[i]}`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
