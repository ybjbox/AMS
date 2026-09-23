import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, FileUp, Loader2, Sparkles, Wand2, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { toast } from 'sonner';
import PageContainer from '@/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/useConfirm';
import { extractNoticeFile, generateNotice } from '@/services/noticeApi';

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.txt,.md,.csv,.xlsx,.docx,.pdf';
const MAX_SOURCE_CHARS = 20_000;

/** 公司默认套打模板（可自定义，抬头/落款修改后记住） */
const DEFAULT_GREETING = '各部门、所属公司：';
const DEFAULT_SIGNATURE = '群邦集团办公室';
const SCAFFOLD_STORAGE_KEY = 'wechat_notice_scaffold';
const DETAIL_STORAGE_KEY = 'wechat_notice_detail';

/** 详细程度档位（与后端 DETAIL_HINTS 键一致） */
type DetailLevel = 'brief' | 'standard' | 'detailed';
const DETAIL_OPTIONS: Array<{ value: DetailLevel; label: string; hint: string }> = [
  { value: 'brief', label: '简洁', hint: '只保留事项、时间、地点等核心信息，一两句话说清' },
  { value: 'standard', label: '标准', hint: '完整说清关键事项与要求，篇幅适中' },
  { value: 'detailed', label: '详细', hint: '保留原始内容的全部信息，分段逐条表述完整' },
];

function loadDetail(): DetailLevel {
  const saved = localStorage.getItem(DETAIL_STORAGE_KEY);
  return saved === 'brief' || saved === 'detailed' ? saved : 'standard';
}

/** 历史生成版本（最新在前，上限 20；退出登录时随 LOCAL_CACHE_KEYS 清除） */
const HISTORY_STORAGE_KEY = 'wechat_notice_history';
const MAX_VERSIONS = 20;

interface NoticeVersion {
  id: string;
  notice: string;
  at: number;
  detail: DetailLevel;
}

function loadHistory(): NoticeVersion[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(
        (v): v is NoticeVersion =>
          !!v &&
          typeof (v as NoticeVersion).notice === 'string' &&
          typeof (v as NoticeVersion).at === 'number'
      )
      .slice(0, MAX_VERSIONS);
  } catch {
    return [];
  }
}

function formatVersionTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadScaffold(): { greeting: string; signature: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(SCAFFOLD_STORAGE_KEY) ?? '{}') as {
      greeting?: unknown;
      signature?: unknown;
    };
    return {
      greeting: typeof saved.greeting === 'string' ? saved.greeting : DEFAULT_GREETING,
      signature: typeof saved.signature === 'string' ? saved.signature : DEFAULT_SIGNATURE,
    };
  } catch {
    return { greeting: DEFAULT_GREETING, signature: DEFAULT_SIGNATURE };
  }
}

/** 剪贴板 API 在非安全上下文可能不可用，退回 execCommand */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }
}

export default function WeChatNotice() {
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState('');
  const [instruction, setInstruction] = useState('');
  const [scaffold, setScaffold] = useState(loadScaffold);
  const [detail, setDetail] = useState<DetailLevel>(loadDetail);
  const [date, setDate] = useState(todayISO);
  const [versions, setVersions] = useState<NoticeVersion[]>(loadHistory);
  const [viewIdx, setViewIdx] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState('');

  const current = versions.length > 0 ? versions[Math.min(viewIdx, versions.length - 1)] : null;

  const setScaffoldField = useCallback((field: 'greeting' | 'signature', value: string) => {
    setScaffold((prev) => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    localStorage.setItem(SCAFFOLD_STORAGE_KEY, JSON.stringify(scaffold));
  }, [scaffold]);

  useEffect(() => {
    localStorage.setItem(DETAIL_STORAGE_KEY, detail);
  }, [detail]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(versions));
  }, [versions]);

  const onPickFile = useCallback(
    async (file: File) => {
      if (file.size > 3 * 1024 * 1024) {
        toast.error('文件超过 3MB 上限');
        return;
      }
      if (source.trim() && !(await confirm({
        title: '导入文件内容？',
        description: '将用文件中提取的文字覆盖当前输入框的内容。',
        confirmText: '覆盖',
      }))) {
        return;
      }
      setExtracting(true);
      setProgress({ stage: '上传文件中…', percent: 5 });
      try {
        const { text, chars, cached } = await extractNoticeFile(file, setProgress);
        setSource(text);
        setFileName(file.name);
        const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
        toast.success(
          cached
            ? `「${file.name}」此前已解析过，直接复用结果（${chars} 字）`
            : `已从「${file.name}」${isImage ? '识别' : '提取'} ${chars} 字`
        );
      } catch (e) {
        toast.error((e as Error).message || '文件解析失败');
      } finally {
        setExtracting(false);
        setProgress(null);
      }
    },
    [source, confirm]
  );

  const onGenerate = useCallback(async () => {
    const trimmed = source.trim();
    if (!trimmed) {
      toast.error('请先粘贴文字或上传文件');
      return;
    }
    if (trimmed.length > MAX_SOURCE_CHARS) {
      toast.error(`原始内容过长（上限 ${MAX_SOURCE_CHARS} 字）`);
      return;
    }
    setGenerating(true);
    setCopied(false);
    try {
      const { notice: result } = await generateNotice({
        source: trimmed,
        instruction: instruction.trim() || undefined,
        greeting: scaffold.greeting.trim() || undefined,
        signature: scaffold.signature.trim() || undefined,
        date: date || undefined,
        detail,
        sourceName: fileName || undefined,
      });
      setVersions((prev) => {
        if (prev[0]?.notice === result) return prev; // 连续重复内容不重复入版本
        const v: NoticeVersion = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          notice: result,
          at: Date.now(),
          detail,
        };
        return [v, ...prev].slice(0, MAX_VERSIONS);
      });
      setViewIdx(0);
    } catch (e) {
      toast.error((e as { error?: string; message?: string }).error || (e as Error).message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [source, instruction, scaffold, date, detail, fileName]);

  /** 拖拽上传：计数器防子元素进出抖动 */
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onCopy = useCallback(async () => {
    if (!current) return;
    if (await copyToClipboard(current.notice)) {
      setCopied(true);
      toast.success('已复制，去微信粘贴发送吧');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('复制失败，请手动选中文本复制');
    }
  }, [current]);

  return (
    <PageContainer width="6xl" className="space-y-6 animate-in fade-in duration-400">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">微信通知生成器</h1>
          <p className="page-subtitle">
            粘贴文字，或上传/拖入文件（图片 / txt / md / csv / Excel / Word / PDF，含扫描版），AI 自动整理成可直接发到微信群的通知文案，一键复制。
          </p>
        </div>
      </div>

      <section
        className="relative space-y-3"
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void onPickFile(file);
        }}
      >
        {dragging && (
          <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-brand-500 bg-brand-50/80 dark:bg-brand-950/70 flex items-center justify-center pointer-events-none">
            <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
              松开鼠标即可上传，自动识别图片或提取文件文字
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h2 className="section-title">原始内容</h2>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onPickFile(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4 mr-2" />
              )}
              上传图片 / 文件
            </Button>
          </div>
        </div>
        {fileName && (
          <p className="text-xs text-muted-foreground">最近导入：{fileName}</p>
        )}
        {extracting && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress?.stage ?? '处理中…'}</span>
              <span className="tabular-nums">
                {progress ? `${Math.min(99, progress.percent)}%` : ''}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent ?? 0}
            >
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
                style={{ width: `${progress?.percent ?? 5}%` }}
              />
            </div>
          </div>
        )}
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="在此粘贴会议安排、放假通知、催办事项等原始内容…"
          className="min-h-48 resize-y font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground text-right">
          {source.length} / {MAX_SOURCE_CHARS} 字
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="section-title">通知格式</h2>
          <p className="text-xs text-muted-foreground mt-1">
            AI 仅整理正文，「【通知】」首行、抬头、落款与日期按下方模板自动套用；留空则不添加。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="notice-greeting">
              抬头
            </label>
            <Input
              id="notice-greeting"
              value={scaffold.greeting}
              onChange={(e) => setScaffoldField('greeting', e.target.value)}
              placeholder="例如：各部门、所属公司："
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="notice-signature">
              落款
            </label>
            <Input
              id="notice-signature"
              value={scaffold.signature}
              onChange={(e) => setScaffoldField('signature', e.target.value)}
              placeholder="例如：群邦集团办公室"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="notice-date">
              落款日期
            </label>
            <Input
              id="notice-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="dark:[color-scheme:dark]"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-title">生成要求</h2>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">详细程度</span>
          <div
            className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
            role="radiogroup"
            aria-label="详细程度"
          >
            {DETAIL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={detail === o.value}
                title={o.hint}
                onClick={() => setDetail(o.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  detail === o.value
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="notice-instruction">
            补充要求（可选）
          </label>
          <Input
            id="notice-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：语气正式一些 / 加上报名接龙 / 控制在 150 字以内"
          />
        </div>
      </section>

      <div>
        <Button size="lg" disabled={generating} onClick={() => void onGenerate()}>
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {generating ? 'AI 整理中…' : '生成微信通知'}
        </Button>
      </div>

      {current && (
        <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-250">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="section-title">生成结果</h2>
            <div className="flex items-center gap-2">
              {versions.length > 1 && (
                <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1 py-0.5">
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    title="查看更早的版本"
                    disabled={viewIdx >= versions.length - 1}
                    onClick={() => setViewIdx((i) => Math.min(versions.length - 1, i + 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <History className="h-3.5 w-3.5" />
                    第 {versions.length - viewIdx} / {versions.length} 版
                  </span>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    title="查看更新的版本"
                    disabled={viewIdx <= 0}
                    onClick={() => setViewIdx((i) => Math.max(0, i - 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
              <Button variant="outline" size="sm" disabled={generating} onClick={() => void onGenerate()}>
                <Wand2 className="h-4 w-4 mr-2" />
                重新生成
              </Button>
              <Button size="sm" onClick={() => void onCopy()}>
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? '已复制' : '一键复制'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {viewIdx === 0 ? '最新版本' : `历史版本 · ${formatVersionTime(current.at)} 生成`}
            {' · '}
            {DETAIL_OPTIONS.find((o) => o.value === current.detail)?.label ?? '标准'}
            {viewIdx !== 0 && (
              <button
                type="button"
                className="ml-2 text-primary hover:underline"
                onClick={() => setViewIdx(0)}
              >
                回到最新版
              </button>
            )}
          </p>
          <div className="rounded-xl border bg-muted/40 p-4 max-h-[28rem] overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {current.notice}
            </pre>
          </div>
        </section>
      )}
    </PageContainer>
  );
}
