import { create } from 'zustand';
import { User } from '../types';
import * as userApi from '../services/userApi';

interface UserStore {
  users: User[];
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  addUser: (user: Omit<User, 'id'>) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}

export const useEmployeeStore = create<UserStore>()((set) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const users = await userApi.fetchUsers();
      set({ users, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addUser: async (user) => {
    set({ isLoading: true, error: null });
    try {
      const newUser = await userApi.createUser(user);
      set((state) => ({ users: [newUser, ...state.users], isLoading: false }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  updateUser: async (user) => {
    set({ isLoading: true, error: null });
    try {
      const { id, ...rest } = user;
      const updatedUser = await userApi.updateUser(id, rest);
      set((state) => ({
        users: state.users.map((u) => u.id === updatedUser.id ? updatedUser : u),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  deleteUser: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await userApi.deleteUser(id);
      set((state) => ({
        users: state.users.filter((u) => u.id !== id),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
}));
