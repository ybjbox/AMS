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
  | 'meal-voucher-spec'
  | 'meal-voucher-print';

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

/**
 * 读单条（参数/草稿）。三种结果必须分开：
 * - `ok` 服务端确实存着这一条；
 * - `absent` 请求成功但没有这一条 —— 首次使用，写默认值下去是对的；
 * - `error` 请求失败 —— **不能**当成「用户没有偏好」，否则调用方一旦把界面回落到默认值
 *   再随手改一个字段，就会用整套默认值覆盖服务端那份真值（参数页共一条链）。
 */
export type SingleResult<T> =
  | { state: 'ok'; payload: T }
  | { state: 'absent' }
  | { state: 'error' };

export async function loadSingle<T>(kind: SavedItemKind, name: string): Promise<SingleResult<T>> {
  try {
    const rows = await savedItemApi.list<T>(kind);
    const hit = rows.find((r) => r.name === name);
    return hit ? { state: 'ok', payload: hit.payload } : { state: 'absent' };
  } catch {
    return { state: 'error' };
  }
}

const errText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  (e as Error)?.message ||
  fallback;

export { errText as savedItemError };
