/**
 * 品牌资源 API（登录页背景 / 系统图标）。
 * 上传契约对应 server/brandingRouter.ts：请求体是文件原始字节（octet-stream），
 * 服务端流式落盘并按字节头校验类型；读端点免鉴权，所以 <img src> 直接指过去即可。
 */
import { http } from './api';

export type BrandingSlot = 'background' | 'icon';

export interface BrandingSlotState {
  url: string;
  updatedAt: string;
  size: number;
  type: string;
}

export interface BrandingStatus {
  background: BrandingSlotState | null;
  icon: BrandingSlotState | null;
}

export const BRANDING_LABELS: Record<BrandingSlot, string> = {
  background: '登录页背景',
  icon: '系统图标',
};

/** 每槽上限，与服务端 BRANDING_MAX_BYTES 同口径（这里只为提前给出人话提示） */
export const BRANDING_LIMITS: Record<BrandingSlot, number> = {
  background: 5 * 1024 * 1024,
  icon: 1 * 1024 * 1024,
};

export const brandingApi = {
  status: (): Promise<BrandingStatus> => http.get<BrandingStatus>('/branding'),

  upload: (slot: BrandingSlot, file: File): Promise<{ success: boolean; url: string; type: string; size: number }> =>
    http.post<{ success: boolean; url: string; type: string; size: number }>(`/branding/${slot}`, file, {
      timeout: 0,
      headers: { 'Content-Type': 'application/octet-stream' },
    }),

  remove: (slot: BrandingSlot): Promise<{ success: boolean }> => http.delete<{ success: boolean }>(`/branding/${slot}`),
};

/** 服务端错误体统一是 { error }，取成人话 */
export function brandingError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || fallback;
}
