import { create } from 'zustand';
import { User } from '../types';
import * as userApi from '../services/userApi';
import { createAsyncAction } from './utils';

interface UserStore {
  users: User[];
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  /**
   * 默认是「没有名单才去拉」的懒加载（多个面板共用，不该各 mount 一次就打一次全量）。
   * 批量写入之后必须 `{ force: true }`：`initialized` 一旦为真，非强制调用会永久短路，
   * 于是导入 200 人后表格仍停在旧名单，而 users 又是排座/台卡/餐券/通讯录/业务单共用的名单源
   * —— 新人在这些面上根本不存在，出纸整批漏人且界面无任何异常提示。
   */
  fetchUsers: (opts?: { force?: boolean }) => Promise<string | null>;
  addUser: (user: Omit<User, 'id'>) => Promise<string | null>;
  updateUser: (user: User) => Promise<string | null>;
  deleteUser: (id: string) => Promise<string | null>;
}

export const useEmployeeStore = create<UserStore>()((set, get) => ({
  users: [],
  isLoading: false,
  error: null,
  initialized: false,

  fetchUsers: async (opts) => {
    if (!opts?.force && get().initialized && get().users.length > 0) return null;

    return createAsyncAction(set, async () => {
      const users = await userApi.fetchUsers();
      return { users, initialized: true };
    });
  },

  addUser: async (user) => {
    return createAsyncAction(set, async () => {
      const newUser = await userApi.createUser(user);
      return { users: [newUser, ...get().users] };
    });
  },

  updateUser: async (user) => {
    return createAsyncAction(set, async () => {
      const { id, ...rest } = user;
      const updatedUser = await userApi.updateUser(id, rest);
      return {
        users: get().users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
      };
    });
  },

  deleteUser: async (id) => {
    return createAsyncAction(set, async () => {
      await userApi.deleteUser(id);
      return {
        users: get().users.filter((u) => u.id !== id),
      };
    });
  },
}));
