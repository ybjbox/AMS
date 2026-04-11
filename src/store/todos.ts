import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Todo, Notification, ReminderSettings } from '../types';

interface TodoState {
  todos: Todo[];
  notifications: Notification[];
  settings: ReminderSettings;
  unreadCount: number;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'time' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  clearNotifications: () => void;
  updateSettings: (settings: Partial<ReminderSettings>) => void;
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set) => ({
      todos: [],
      notifications: [
        { id: '1', title: '新员工入职', message: '张三已完成入职手续', time: new Date().toISOString(), read: false },
        {
          id: '2',
          title: '系统更新',
          message: '系统将于今晚 22:00 进行维护',
          time: new Date().toISOString(),
          read: false,
        },
      ],
      unreadCount: 0,
      settings: {
        contractExpiryDays: 30,
        probationConversionDays: 15,
      },
      addTodo: (todo) =>
        set((state) => {
          // Avoid duplicate automated todos
          if (
            todo.type !== 'manual' &&
            state.todos.some((t) => t.type === todo.type && t.targetId === todo.targetId && !t.completed)
          ) {
            return state;
          }
          const newTodo: Todo = {
            ...todo,
            id: Math.random().toString(36).substring(7),
            completed: false,
            createdAt: new Date().toISOString(),
          };
          return { todos: [newTodo, ...state.todos] };
        }),
      toggleTodo: (id) =>
        set((state) => ({
          todos: state.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        })),
      deleteTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((t) => t.id !== id),
        })),
      addNotification: (notification) =>
        set((state) => {
          const newNotification: Notification = {
            ...notification,
            id: Math.random().toString(36).substring(7),
            time: new Date().toISOString(),
            read: false,
          };
          return {
            notifications: [newNotification, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          };
        }),
      markNotificationAsRead: (id) =>
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id);
          if (notification && !notification.read) {
            return {
              notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
              unreadCount: Math.max(0, state.unreadCount - 1),
            };
          }
          return state;
        }),
      markAllNotificationsAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),
      clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
    }),
    {
      name: 'todo-storage',
    }
  )
);
