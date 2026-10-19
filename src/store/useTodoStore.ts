import { create } from 'zustand';
import { toast } from 'sonner';
import { Todo } from '../types';
import { todoApi } from '../services/todoApi';
import { formatDate } from '../utils/dateUtils';

interface TodoState {
  todos: Todo[];
  isLoading: boolean;
  /**
   * 拉取失败的原因。原先只弹一个四秒的 toast，屏幕上留下的是「暂无待办事项，
   * 点击右上角添加第一个任务」——用户据此又录了一遍（2026-09-26 审查 M1，待办这一路当时漏做）。
   */
  loadError: string | null;
  fetchTodos: () => Promise<void>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'completed'>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
}

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

/**
 * 待办的催办口径：未完成 / 已逾期 / 今天到期。
 *
 * 侧栏角标、首页卡、待办页原先各写一遍 `todos.filter(t => !t.completed).length`，
 * 而"未完成 N 件"本身不指向任何动作 —— 真正要看到的是其中几件已经过期、几件今天到期。
 * 一份算法放这里，三处读它，才不会出现角标 5、页面写 4 的打架。
 */
export function todoUrgency(
  todos: Todo[],
  today = new Date()
): { pending: number; overdue: number; dueToday: number } {
  const key = formatDate(today);
  let pending = 0;
  let overdue = 0;
  let dueToday = 0;
  for (const t of todos) {
    if (t.completed) continue;
    pending += 1;
    const due = (t.dueDate ?? '').slice(0, 10);
    if (!due) continue; // 没设截止日的待办不该被算成逾期
    if (due === key) dueToday += 1;
    else if (due < key) overdue += 1;
  }
  return { pending, overdue, dueToday };
}

// 并发去重：同一时刻只允许一个 todos 请求在途
let todosInflight: Promise<void> | null = null;

/**
 * 待办全部由服务端驱动（跨设备同步），本地不再持久化任何东西：
 * 原先 persist 只留着一份提醒阈值，而阈值已迁到服务端 settings KV
 *（见 server/remindersDb.ts 与「系统设置 → 到期提醒」）。
 */
export const useTodoStore = create<TodoState>()((set, get) => ({
  todos: [],
  isLoading: false,
  loadError: null,

  /** 从后端拉取「我创建的 + 派给我的」待办（挂载时调用）。
   *  inflight 去重：并发调用复用同一 Promise，避免多组件同时 mount 重复请求。 */
  fetchTodos: async () => {
    if (todosInflight) return todosInflight;
    todosInflight = (async () => {
      set({ isLoading: true });
      try {
        const todos = await todoApi.list();
        set({ todos, isLoading: false, loadError: null });
      } catch (e) {
        set({ isLoading: false, loadError: errText(e, '待办加载失败，请先刷新或检查后端是否在线') });
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
}));
