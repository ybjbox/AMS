import { http } from './api';
import { STORAGE_KEYS } from '../config/constants';

/**
 * 微信通知一键生成器 API — 对接后端 noticeRouter（/api/notice）。
 * 生成结果仅用于「一键复制」到微信，系统不直接投递。
 */

export interface NoticeExtractResult {
  text: string;
  chars: number;
}

export interface NoticeGenerateResult {
  notice: string;
  sourceChars: number;
}

/** 文件 → 纯文本预览（raw 字节体上传，服务端按 filename 判类型） */
export async function extractNoticeFile(file: File): Promise<NoticeExtractResult> {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const res = await fetch(
    `/api/notice/extract?filename=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  return (await res.json()) as NoticeExtractResult;
}

/** 文本 → AI 生成微信通知文案 */
export const generateNotice = (
  source: string,
  instruction?: string
): Promise<NoticeGenerateResult> =>
  http.post<NoticeGenerateResult>('/notice/generate', { source, instruction });
