import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../config/constants';

interface AppSettingsState {
  loginBackground: string | null;
  systemIcon: string | null;
  theme: 'light' | 'dark' | 'system';
  enableStrictPermission: boolean;
  /** 侧边栏模块自定义顺序（path 列表；空 = 按 routeConfig 默认顺序） */
  navOrder: string[];
  setLoginBackground: (url: string | null) => void;
  setSystemIcon: (url: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setEnableStrictPermission: (enable: boolean) => void;
  setNavOrder: (order: string[]) => void;
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      loginBackground: null,
      systemIcon: null,
      theme: 'system',
      enableStrictPermission: false,
      navOrder: [],
      setLoginBackground: (url) => set({ loginBackground: url }),
      setSystemIcon: (url) => set({ systemIcon: url }),
      setTheme: (theme) => set({ theme }),
      setEnableStrictPermission: (enable) => set({ enableStrictPermission: enable }),
      setNavOrder: (order) => set({ navOrder: order }),
    }),
    {
      name: STORAGE_KEYS.THEME,
    }
  )
);

interface LoadingState {
  globalLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useLoadingStore = create<LoadingState>()((set) => ({
  globalLoading: false,
  setLoading: (loading) => set({ globalLoading: loading }),
}));
