/**
 * 用户留存条目 API —— 对接 /api/saved-items（server/savedItemsRouter.ts）。
 *
 * 座位方案、台卡/座次的打印参数、未保存草稿这类「刷新就不见」的东西统一走这里；
 * 服务端按当前账号隔离，前端不需要也不应该传 owner。
 */
import { http } from './api';

export type SavedItemKind =
  | 'seating-plan'
  | 'seating-prefs'
  | 'namecards-prefs'
  | 'meal-voucher-spec';

export interface SavedItem<T = unknown> {
  id: string;
  kind: SavedItemKind;
  name: string;
  owner: string;
  payload: T;
  createdAt: string;
  updatedAt: string;
}

/** 参数类条目在同一 kind 下的固定名称（同 (kind, name) 唯一覆盖） */
export const PREFS_NAME = '__self__';

export const savedItemApi = {
  list: <T = unknown>(kind: SavedItemKind): Promise<SavedItem<T>[]> =>
    http.get<SavedItem<T>[]>('/saved-items', { params: { kind } }),
  save: <T = unknown>(kind: SavedItemKind, name: string, payload: T): Promise<SavedItem<T>> =>
    http.post<SavedItem<T>>('/saved-items', { kind, name, payload }),
  remove: (id: string): Promise<{ success: boolean }> => http.delete<{ success: boolean }>(`/saved-items/${id}`),
};

/** 读单条（草稿/参数）；不存在或网络失败都返回 null，让调用方走默认值而不是弹错误 */
export async function loadSingle<T>(kind: SavedItemKind, name: string): Promise<T | null> {
  try {
    const rows = await savedItemApi.list<T>(kind);
    return rows.find((r) => r.name === name)?.payload ?? null;
  } catch {
    return null;
  }
}

const errText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  (e as Error)?.message ||
  fallback;

export { errText as savedItemError };
