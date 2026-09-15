import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 列表页筛选/分页状态的 URL 同步 hook。
 *
 * 目的：
 * - 刷新保持：状态写入 URL，F5 后恢复原视图
 * - 可深链：带参数 URL 可直接分享/收藏
 * - 干净地址栏：默认值/空值不写入
 *
 * 用法：
 *   const urlState = useUrlState();
 *   // 读：urlState.get('q') / urlState.getNumber('page') / urlState.getAll('dept')
 *   // 写：urlState.set({ q: '张', page: 2 })      // 写入（replace 模式，不污染历史）
 *   //     urlState.set({ q: null })               // 删除参数
 */
export function useUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const get = useCallback(
    (key: string, fallback = ''): string => searchParams.get(key) ?? fallback,
    [searchParams]
  );

  const getNumber = useCallback(
    (key: string, fallback = 1): number => {
      const raw = searchParams.get(key);
      if (raw === null) return fallback;
      const v = parseInt(raw, 10);
      return Number.isFinite(v) && v >= 1 ? v : fallback;
    },
    [searchParams]
  );

  const getAll = useCallback(
    (key: string): string[] => searchParams.getAll(key),
    [searchParams]
  );

  /** 批量写入参数；value 为 null/undefined/''/0 时删除该参数 */
  const set = useCallback(
    (updates: Record<string, string | number | null | undefined | string[]>, options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            next.delete(key);
            if (value === null || value === undefined || value === '' || value === 0) continue;
            if (Array.isArray(value)) {
              value.forEach((v) => next.append(key, String(v)));
            } else {
              next.set(key, String(value));
            }
          }
          return next;
        },
        { replace: options?.replace ?? true }
      );
    },
    [setSearchParams]
  );

  return useMemo(() => ({ get, getNumber, getAll, set }), [get, getNumber, getAll, set]);
}
