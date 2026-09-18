import React, { useCallback, useRef, useState } from 'react';
import { Check, Copy, FileUp, Loader2, MessageSquareText, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import PageContainer from '@/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/useConfirm';
import { extractNoticeFile, generateNotice } from '@/services/noticeApi';

const ACCEPT = '.txt,.md,.csv,.xlsx,.docx,.pdf';
const MAX_SOURCE_CHARS = 20_000;

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
  const [notice, setNotice] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState('');

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
      try {
        const { text, chars } = await extractNoticeFile(file);
        setSource(text);
        setFileName(file.name);
        toast.success(`已从「${file.name}」提取 ${chars} 字`);
      } catch (e) {
        toast.error((e as Error).message || '文件解析失败');
      } finally {
        setExtracting(false);
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
      const { notice: result } = await generateNotice(trimmed, instruction.trim() || undefined);
      setNotice(result);
    } catch (e) {
      toast.error((e as { error?: string; message?: string }).error || (e as Error).message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [source, instruction]);

  const onCopy = useCallback(async () => {
    if (!notice) return;
    if (await copyToClipboard(notice)) {
      setCopied(true);
      toast.success('已复制，去微信粘贴发送吧');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('复制失败，请手动选中文本复制');
    }
  }, [notice]);

  return (
    <PageContainer width="6xl" className="space-y-6 animate-in fade-in duration-400">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-brand-100 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300">
          <MessageSquareText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">微信通知生成器</h1>
          <p className="text-sm text-muted-foreground mt-1">
            粘贴文字或上传文件（txt / md / csv / Excel / Word / PDF），AI 自动整理成可直接发到微信群的通知文案，一键复制。
          </p>
        </div>
      </div>

      <section className="space-y-3">
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
              上传文件提取
            </Button>
          </div>
        </div>
        {fileName && (
          <p className="text-xs text-muted-foreground">最近导入：{fileName}</p>
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
        <h2 className="section-title">补充要求（可选）</h2>
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例如：语气正式一些 / 加上报名接龙 / 控制在 150 字以内"
        />
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

      {notice && (
        <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-250">
          <div className="flex items-center justify-between">
            <h2 className="section-title">生成结果</h2>
            <div className="flex items-center gap-2">
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
          <div className="rounded-xl border bg-muted/40 p-4 max-h-[28rem] overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {notice}
            </pre>
          </div>
        </section>
      )}
    </PageContainer>
  );
}
