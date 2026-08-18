import { useState, useEffect, useRef, useCallback } from 'react';

export type BackendStatus = 'checking' | 'online' | 'offline';

const HEALTH_URL = '/api/health';
const POLL_INTERVAL_MS = 15000;
const PROBE_TIMEOUT_MS = 5000;

/**
 * 通过真实的 /api/health 端点轮询后端可达性。
 *
 * 设计要点：
 * 1. 使用原生 fetch（不走 api.ts 的 axios 拦截器），避免后端离线时反复弹「网络请求失败」toast。
 * 2. 校验响应体 JSON 的 status === 'ok'，而非仅看 res.ok——
 *    否则在 dev 纯前端兜底（返回 index.html）时会误判为在线。
 * 3. 浏览器明确离线（navigator.onLine === false）时直接判离线，省一次无用请求。
 * 4. 监听 online/offline 与页面可见性，后端恢复（切回标签页/网络恢复）时立即复检。
 */
async function probeOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useBackendStatus(pollInterval = POLL_INTERVAL_MS): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const mountedRef = useRef(true);

  const probe = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    const ok = await probeOnce();
    if (mountedRef.current) {
      setStatus(ok ? 'online' : 'offline');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void probe();

    const interval = setInterval(() => void probe(), pollInterval);

    const handleOnline = () => void probe();
    const handleOffline = () => setStatus('offline');
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void probe();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [probe, pollInterval]);

  return status;
}
