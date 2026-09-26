import { useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppSettings } from '../store/appSettings';
import { useInitData } from './useInitData';
import { useNotificationStore } from '../store/useNotificationStore';
import { useUserStore } from '../store/useUserStore';
import { useBrandingSync } from './useBrandingSync';
import { EVENT_KEYS, DEFAULT_SYSTEM_ICON } from '../config/constants';

export function useAppLifecycle() {
  const navigate = useNavigate();
  const theme = useAppSettings((state) => state.theme);
  const systemIcon = useAppSettings((state) => state.systemIcon);
  const addNotification = useNotificationStore((state) => state.addNotification);

  // Data initialization
  useInitData();

  // 品牌资源（登录背景 / 系统图标）以服务端为准
  useBrandingSync();

  // Theme applying
  useLayoutEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = () => {
      root.classList.remove('light', 'dark');
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // System Icon applying（未上传自定义图标时使用内置默认 logo）
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = systemIcon || DEFAULT_SYSTEM_ICON;
  }, [systemIcon]);

  // Auth expired listener
  useEffect(() => {
    const handleAuthExpired = () => {
      // api.ts 的 401 分支只清了 localStorage；内存里那份 userInfo 还在，
      // 于是「被弹到登录页 → 点后退」时 ProtectedRoute 照样放行，
      // 剩下的是一个看起来登录着、全是空表、一句错误都没有的空壳。
      useUserStore.getState().logout();
      navigate('/login', { replace: true });
    };

    window.addEventListener(EVENT_KEYS.AUTH_EXPIRED, handleAuthExpired);
    return () => window.removeEventListener(EVENT_KEYS.AUTH_EXPIRED, handleAuthExpired);
  }, [navigate]);

  // API error listener
  useEffect(() => {
    const handleApiError = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        const { title, message, type } = customEvent.detail;
        addNotification({ title, message, type });

        // Also show toast
        if (type === 'error') toast.error(title, { description: message });
        else if (type === 'warning') toast.warning(title, { description: message });
        else if (type === 'success') toast.success(title, { description: message });
        else toast.info(title, { description: message });
      }
    };
    window.addEventListener(EVENT_KEYS.API_ERROR, handleApiError);
    return () => window.removeEventListener(EVENT_KEYS.API_ERROR, handleApiError);
  }, [addNotification]);
}
