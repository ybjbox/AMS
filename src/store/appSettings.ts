import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../config/constants';
import { routeConfig } from '../config/routes';

interface AppSettingsState {
  /** 服务端图片地址（/api/branding/…）。历史上这里存过 base64 data URL，会把配额打爆 */
  loginBackground: string | null;
  systemIcon: string | null;
  theme: 'light' | 'dark' | 'system';
  /** 侧边栏模块自定义顺序（path 列表；空 = 按 routeConfig 默认顺序） */
  navOrder: string[];
  setLoginBackground: (url: string | null) => void;
  setSystemIcon: (url: string | null) => void;
  /** 用服务端真值覆盖两个图片位（启动同步、上传成功、恢复默认都走这里） */
  applyBranding: (branding: { background: string | null; icon: string | null }) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setNavOrder: (order: string[]) => void;
}

/**
 * 路由改名/合并时，老用户存的还是旧 path：它们在界面上不渲染（导航项按 routeConfig 过滤），
 * 却仍占住位次，于是合并后的新入口拿不到 rank、静默沉到侧栏最后。
 * 这里换名到后继 path，再剪掉 routeConfig 里已经不存在的项。
 */
const NAV_ORDER_RENAMES: Record<string, string> = {
  '/seating': '/print-tools',
  '/name-cards': '/print-tools',
  '/meal-vouchers': '/print-tools',
};

function migrateNavOrder(order: unknown): string[] {
  if (!Array.isArray(order)) return [];
  const known = new Set(routeConfig.map((r) => r.path));
  const next = order
    .filter((p): p is string => typeof p === 'string')
    .map((p) => NAV_ORDER_RENAMES[p] ?? p);
  return [...new Set(next)].filter((p) => known.has(p));
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      loginBackground: null,
      systemIcon: null,
      theme: 'system',
      navOrder: [],
      setLoginBackground: (url) => set({ loginBackground: url }),
      setSystemIcon: (url) => set({ systemIcon: url }),
      applyBranding: ({ background, icon }) => set({ loginBackground: background, systemIcon: icon }),
      setTheme: (theme) => set({ theme }),
      setNavOrder: (order) => set({ navOrder: order }),
    }),
    {
      name: STORAGE_KEYS.THEME,
      version: 1,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<AppSettingsState>;
        return { ...state, navOrder: migrateNavOrder(state.navOrder) };
      },
    }
  )
);

interface LoadingState {
  globalLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useLoadingStore = create<LoadingState>()((set) => ({
  globalLoading: false,
  setLoading: (loading: boolean) => set({ globalLoading: loading }),
}));
