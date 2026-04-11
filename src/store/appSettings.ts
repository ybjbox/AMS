import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../config/constants';

interface AppSettingsState {
  loginBackground: string | null;
  systemIcon: string | null;
  theme: 'light' | 'dark' | 'system';
  enableStrictPermission: boolean;
  globalLoading: boolean;
  setLoginBackground: (url: string | null) => void;
  setSystemIcon: (url: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setEnableStrictPermission: (enable: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      loginBackground: null,
      systemIcon: null,
      theme: 'system',
      enableStrictPermission: false,
      globalLoading: false,
      setLoginBackground: (url) => set({ loginBackground: url }),
      setSystemIcon: (url) => set({ systemIcon: url }),
      setTheme: (theme) => set({ theme }),
      setEnableStrictPermission: (enable) => set({ enableStrictPermission: enable }),
      setLoading: (loading) => set({ globalLoading: loading }),
    }),
    {
      name: STORAGE_KEYS.THEME,
    }
  )
);
