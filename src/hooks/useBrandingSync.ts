/**
 * 用服务端真值同步两个图片位。
 * 登录页与主界面都要调用：图片存在服务端，换浏览器/设备也能拿到同一套品牌资源。
 */
import { useEffect } from 'react';
import { brandingApi } from '@/services/brandingApi';
import { useAppSettings } from '@/store/appSettings';

export function useBrandingSync() {
  const applyBranding = useAppSettings((state) => state.applyBranding);

  useEffect(() => {
    let cancelled = false;
    brandingApi
      .status()
      .then((s) => {
        if (cancelled) return;
        applyBranding({ background: s.background?.url ?? null, icon: s.icon?.url ?? null });
      })
      .catch(() => {
        /* 拿不到就沿用本机已持久化的值，不打扰用户 */
      });
    return () => {
      cancelled = true;
    };
  }, [applyBranding]);
}
