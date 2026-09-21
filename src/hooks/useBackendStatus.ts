import { useState, useEffect, useRef, useCallback } from 'react';

export type BackendStatus = 'checking' | 'online' | 'error' | 'offline';

/** 探针结果三态：可达且正常 / 可达但异常 / 无法连接 */
export type ProbeResult = 'online' | 'error' | 'offline';

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
async function probeOnce(): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    // 有 HTTP 响应但状态码异常：服务可达但报错 → error
    if (!res.ok) return 'error';
    let data: { status?: string };
    try {
      data = (await res.json()) as { status?: string };
    } catch {
      // 响应非 JSON（如 dev 纯前端兜底返回 index.html）：后端并未真正在服务 → offline
      return 'offline';
    }
    return data?.status === 'ok' ? 'online' : 'error';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

export function useBackendStatus(pollInterval = POLL_INTERVAL_MS): BackendStatus {
  // 浏览器已经报告离线时直接以 offline 起手，省掉「检查中 → 立刻改口」的那一帧
  const [status, setStatus] = useState<BackendStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'checking'
  );
  const mountedRef = useRef(true);

  const probe = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    const result = await probeOnce();
    if (mountedRef.current) {
      setStatus(result);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // 挂载即探一次是本 hook 的语义（状态灯要在进入应用时就亮起来）；
    // 探到的结果异步落回状态，同步分支只有上面那一条已离线的短路
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
