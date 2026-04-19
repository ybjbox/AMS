import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Todo, ReminderSettings } from '../types';

interface TodoState {
  todos: Todo[];
  settings: ReminderSettings;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateSettings: (settings: Partial<ReminderSettings>) => void;
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set) => ({
      todos: [],
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
