import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { Todo, ReminderSettings } from '../types';
import { todoApi } from '../services/todoApi';

interface TodoState {
  todos: Todo[];
  settings: ReminderSettings;
  isLoading: boolean;
  fetchTodos: () => Promise<void>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateSettings: (settings: Partial<ReminderSettings>) => void;
}

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

// 并发去重：同一时刻只允许一个 todos 请求在途
let todosInflight: Promise<void> | null = null;

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],
      settings: {
        contractExpiryDays: 30,
        probationConversionDays: 15,
      },
      isLoading: false,

      /** 从后端拉取「我创建的 + 派给我的」待办（挂载时调用）。
       *  inflight 去重：并发调用复用同一 Promise，避免多组件同时 mount 重复请求。 */
      fetchTodos: async () => {
        if (todosInflight) return todosInflight;
        todosInflight = (async () => {
          set({ isLoading: true });
          try {
            const todos = await todoApi.list();
            set({ todos, isLoading: false });
          } catch (e) {
            set({ isLoading: false });
            toast.error(errText(e, '待办加载失败'));
          } finally {
            todosInflight = null;
          }
        })();
        return todosInflight;
      },

      addTodo: (todo) => {
        // 自动提醒类待办去重（与后端幂等规则一致：同类 + 同目标 + 未完成）
        if (todo.type !== 'manual') {
          const dup = get().todos.some(
            (t) => t.type === todo.type && t.targetId === todo.targetId && !t.completed
          );
          if (dup) return;
        }
        todoApi
          .create(todo)
          .then((created) => set((state) => ({ todos: [created, ...state.todos] })))
          .catch((e) => toast.error(errText(e, '待办创建失败')));
      },

      toggleTodo: (id) => {
        const target = get().todos.find((t) => t.id === id);
        if (!target) return;
        const completed = !target.completed;
        // 乐观更新，失败回滚
        set((state) => ({
          todos: state.todos.map((t) => (t.id === id ? { ...t, completed } : t)),
        }));
        todoApi
          .update(id, { completed })
          .then((updated) =>
            set((state) => ({
              todos: state.todos.map((t) => (t.id === id ? { ...t, ...updated } : t)),
            }))
          )
          .catch((e) => {
            set((state) => ({
              todos: state.todos.map((t) => (t.id === id ? { ...t, completed: !completed } : t)),
            }));
            toast.error(errText(e, '待办状态更新失败'));
          });
      },

      deleteTodo: (id) => {
        const prev = get().todos;
        set((state) => ({ todos: state.todos.filter((t) => t.id !== id) }));
        todoApi.remove(id).catch((e) => {
          set({ todos: prev });
          toast.error(errText(e, '待办删除失败'));
        });
      },

      // 提醒阈值属个人偏好，继续存本地
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
    }),
    {
      // 待办已迁移到服务端（跨设备同步）；persist 仅保留提醒阈值。
      // version 升到 1 丢弃旧版本地 todos，避免与服务器数据混叠。
      name: 'todo-storage',
      version: 1,
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
