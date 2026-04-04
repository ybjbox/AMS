import { create } from 'zustand';

// 定义 AppStore 的状态和动作类型
export interface AppState {
  globalLoading: boolean;
  setLoading: (loading: boolean) => void;
}

// 创建全局 AppStore
export const useAppStore = create<AppState>((set) => ({
  globalLoading: false,
  setLoading: (loading: boolean) => set({ globalLoading: loading }),
}));
