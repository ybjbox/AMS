import { http } from './api';
import { STORAGE_KEYS } from '../config/constants';

/**
 * 微信通知一键生成器 API — 对接后端 noticeRouter（/api/notice）。
 * 生成结果仅用于「一键复制」到微信，系统不直接投递。
 */

export interface NoticeExtractResult {
  text: string;
  chars: number;
  /** 命中服务端解析缓存（同一文件重复上传，未重新解析/OCR） */
  cached?: boolean;
}

/** 解析任务进度（服务端异步 job，前端轮询） */
export interface NoticeExtractProgress {
  stage: string;
  percent: number;
}

interface ExtractJobSnapshot extends Partial<NoticeExtractResult> {
  status: 'running' | 'done' | 'error';
  stage: string;
  percent: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 文件 → 纯文本预览（raw 字节体上传，服务端按 filename 判类型；异步任务轮询进度） */
export async function extractNoticeFile(
  file: File,
  onProgress?: (p: NoticeExtractProgress) => void
): Promise<NoticeExtractResult> {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const res = await fetch(
    `/api/notice/extract?filename=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...authHeaders,
      },
      body: file,
    }
  );
  if (!res.ok) {
    let err: { error?: string };
    try {
      err = await res.json();
    } catch {
      err = { error: `HTTP ${res.status}` };
    }
    throw new Error(err.error || '文件解析失败');
  }
  const first = (await res.json()) as {
    jobId?: string;
    text?: string;
    chars?: number;
    cached?: boolean;
  };
  if (first.cached && first.text != null) {
    return { text: first.text, chars: first.chars ?? first.text.length, cached: true };
  }
  const jobId = first.jobId;
  if (!jobId) throw new Error('文件解析失败');
  // 3 分钟兜底上限（扫描件逐页 OCR 也远快于此）
  const deadline = Date.now() + 3 * 60_000;
  for (;;) {
    await sleep(600);
    const r = await fetch(`/api/notice/extract/job/${encodeURIComponent(jobId)}`, {
      headers: authHeaders,
    });
    if (r.status === 404) throw new Error('任务不存在或已过期，请重新上传文件');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as ExtractJobSnapshot;
    onProgress?.({ stage: j.stage, percent: j.percent });
    if (j.status === 'done' && j.text != null) return { text: j.text, chars: j.chars ?? j.text.length };
    if (j.status === 'error') throw new Error(j.error || '文件解析失败');
    if (Date.now() > deadline) throw new Error('解析超时，请重试或更换文件');
  }
}

export interface NoticeGenerateResult {
  notice: string;
  sourceChars: number;
}

/** 文本 → AI 生成微信通知文案（正文由 AI 生成，抬头/落款/日期由服务端套用模板） */
export interface NoticeGenerateParams {
  source: string;
  instruction?: string;
  greeting?: string;
  signature?: string;
  /** ISO 日期 yyyy-mm-dd，渲染为「2026年9月14日」 */
  date?: string;
  /** 正文详细程度，缺省 standard */
  detail?: 'brief' | 'standard' | 'detailed';
  /** 导入文件的名称（常含正式文件标题，供 AI 生成《…》引用） */
  sourceName?: string;
}

export const generateNotice = (
  params: NoticeGenerateParams
): Promise<NoticeGenerateResult> =>
  http.post<NoticeGenerateResult>('/notice/generate', params);

/** 清除当前用户的文件解析临时缓存（退出登录时调用，失败静默） */
export const clearNoticeCache = (): Promise<{ ok: boolean; cleared: number }> =>
  http.delete<{ ok: boolean; cleared: number }>('/notice/extract/cache');
