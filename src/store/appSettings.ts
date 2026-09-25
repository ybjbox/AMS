import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../config/constants';

interface AppSettingsState {
  /** 服务端图片地址（/api/branding/…）。历史上这里存过 base64 data URL，会把配额打爆 */
  loginBackground: string | null;
  systemIcon: string | null;
  theme: 'light' | 'dark' | 'system';  /** 侧边栏模块自定义顺序（path 列表；空 = 按 routeConfig 默认顺序） */
  navOrder: string[];
  setLoginBackground: (url: string | null) => void;
  setSystemIcon: (url: string | null) => void;
  /** 用服务端真值覆盖两个图片位（启动同步、上传成功、恢复默认都走这里） */
  applyBranding: (branding: { background: string | null; icon: string | null }) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;  setNavOrder: (order: string[]) => void;
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      loginBackground: null,
      systemIcon: null,
      theme: 'system',      navOrder: [],
      setLoginBackground: (url) => set({ loginBackground: url }),
      setSystemIcon: (url) => set({ systemIcon: url }),
      applyBranding: ({ background, icon }) => set({ loginBackground: background, systemIcon: icon }),
      setTheme: (theme) => set({ theme }),      setNavOrder: (order) => set({ navOrder: order }),
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
