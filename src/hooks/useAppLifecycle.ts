import { useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppSettings } from '../store/appSettings';
import { useInitData } from './useInitData';
import { useNotificationStore } from '../store/useNotificationStore';
import { EVENT_KEYS } from '../config/constants';

export function useAppLifecycle() {
  const navigate = useNavigate();
  const theme = useAppSettings((state) => state.theme);
  const systemIcon = useAppSettings((state) => state.systemIcon);
  const addNotification = useNotificationStore((state) => state.addNotification);

  // Data initialization
  useInitData();

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

  // System Icon applying
  useEffect(() => {
    if (systemIcon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = systemIcon;
    }
  }, [systemIcon]);

  // Auth expired listener
  useEffect(() => {
    const handleAuthExpired = () => {
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
