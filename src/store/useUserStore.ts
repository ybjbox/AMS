import { create } from 'zustand';
import { STORAGE_KEYS } from '../config/constants';
import { hasPermission as checkPermission } from '../utils/permission';

// 定义 UserInfo 接口
export interface UserInfo {
  id: string | number;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;
  status?: number;
  role?: string;
}

// 定义 UserStore 的状态和动作类型
export interface UserState {
  userInfo: UserInfo | null;
  token: string | null;
  setUser: (userInfo: UserInfo, token: string) => void;
  logout: () => void;
  hasPermission: (permissionCode: string) => boolean;
}

// 尝试从 localStorage 初始化 userInfo
const getInitialUserInfo = (): UserInfo | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_INFO);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to parse user info from localStorage:', error);
    return null;
  }
};

// 创建 useUserStore
export const useUserStore = create<UserState>((set) => ({
  userInfo: getInitialUserInfo(),
  token: localStorage.getItem(STORAGE_KEYS.TOKEN) || null,
  
  setUser: (userInfo: UserInfo, token: string) => {
    // 写入 localStorage
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));
    
    // 更新状态
    set({ userInfo, token });
  },
  
  logout: () => {
    // 清除 localStorage
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    
    // 清空状态
    set({ userInfo: null, token: null });
  },

  hasPermission: (permissionCode: string) => {
    return checkPermission(permissionCode);
  },
}));
