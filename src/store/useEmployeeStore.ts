import { create } from 'zustand';
import { User } from '../types';
import * as userApi from '../services/userApi';
import { createAsyncAction } from './utils';

interface UserStore {
  users: User[];
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  fetchUsers: () => Promise<void>;
  addUser: (user: Omit<User, 'id'>) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}

export const useEmployeeStore = create<UserStore>()((set, get) => ({
  users: [],
  isLoading: false,
  error: null,
  initialized: false,

  fetchUsers: async () => {
    if (get().initialized && get().users.length > 0) return;

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
