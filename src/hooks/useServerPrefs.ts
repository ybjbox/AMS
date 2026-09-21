import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { loadSingle, PREFS_NAME, savedItemApi, savedItemError, type SavedItemKind } from '@/services/savedItemApi';

/**
 * 「跟着账号走的参数」：服务端存一份，刷新/换设备都不丢。
 *
 * 只用于体积小、写入频率低的偏好（打印参数这类），不拿它存业务数据。
 * 写入是防抖的：先本地生效，再落库；失败只提示不回滚（下一次改动会再试）。
 */
export function useServerPrefs<T extends object>(kind: SavedItemKind, defaults: T) {
  const [value, setValue] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadSingle<Partial<T>>(kind, PREFS_NAME);
      if (cancelled) return;
      if (stored && typeof stored === 'object') setValue((prev) => ({ ...prev, ...stored }));
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [kind]);

  const flush = useCallback(async () => {
    if (!pending.current) return;
    const payload = pending.current;
    pending.current = null;
    setSaving(true);
    try {
      await savedItemApi.save(kind, PREFS_NAME, payload);
    } catch (e) {
      toast.error(savedItemError(e, '参数保存失败'));
    } finally {
      setSaving(false);
    }
  }, [kind]);

  const update = useCallback(
    (next: T | Partial<T> | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : { ...prev, ...(next as Partial<T>) };
        // 服务端值还没回来之前不要回写，否则会把用户的旧参数覆盖成默认值
        if (ready) {
          pending.current = resolved;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), 700);
        }
        return resolved;
      });
    },
    [ready, flush]
  );

  return { value, setValue: update, ready, saving };
}
