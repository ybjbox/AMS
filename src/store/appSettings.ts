import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppSettingsState {
  loginBackground: string | null;
  systemIcon: string | null;
  theme: 'light' | 'dark' | 'system';
  setLoginBackground: (url: string | null) => void;
  setSystemIcon: (url: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set) => ({
      loginBackground: null,
      systemIcon: null,
      theme: 'system',
      setLoginBackground: (url) => set({ loginBackground: url }),
      setSystemIcon: (url) => set({ systemIcon: url }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'app-settings-storage',
    }
  )
);
