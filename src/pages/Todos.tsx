import { Pressable } from '@/components/ui/Pressable';
import PageContainer from "@/components/PageContainer";
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTodoStore, todoUrgency } from '../store/useTodoStore';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Calendar, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatDate } from '@/utils/dateUtils';
import { useConfirm } from '@/hooks/useConfirm';

type Filter = 'all' | 'pending' | 'overdue' | 'today';

export default function Todos() {
  const confirm = useConfirm();
  const todos = useTodoStore((state) => state.todos);
  const loadError = useTodoStore((state) => state.loadError);
  const toggleTodo = useTodoStore((state) => state.toggleTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const addTodo = useTodoStore((state) => state.addTodo);
  const fetchTodos = useTodoStore((state) => state.fetchTodos);

  // 待办已迁移到服务端：挂载时拉取「我创建的 + 派给我的」
  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);
  const [isAdding, setIsAdding] = useState(false);
  const [only, setOnly] = useState<Filter>('all');
  const [newTodo, setNewTodo] = useState({ title: '', description: '', dueDate: '' });

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTodo.title) return;
      addTodo({
        ...newTodo,
        type: 'manual',
      });
      setNewTodo({ title: '', description: '', dueDate: '' });
      setIsAdding(false);
    },
    [newTodo, addTodo]
  );

  const sortedTodos = useMemo(() => {
    const key = formatDate(new Date());
    return [...todos]
      .filter((t) => {
        if (only === 'all') return true;
        if (only === 'pending') return !t.completed;
        if (t.completed) return false;
        const due = (t.dueDate ?? '').slice(0, 10);
        if (!due) return false;
        return only === 'overdue' ? due < key : due === key;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [todos, only]);

  /** 未完成 / 已逾期 / 今天到期 —— 点数字即筛选，所以它们不是装饰 */
  const urgency = useMemo(() => todoUrgency(todos), [todos]);
  const chips: { id: Filter; label: string; n: number; tone: string }[] = [
    { id: 'all', label: '全部', n: todos.length, tone: '' },
    { id: 'overdue', label: '已逾期', n: urgency.overdue, tone: urgency.overdue ? 'text-red-700 dark:text-red-400' : '' },
    { id: 'today', label: '今天到期', n: urgency.dueToday, tone: urgency.dueToday ? 'text-amber-700 dark:text-amber-400' : '' },
    { id: 'pending', label: '未完成', n: urgency.pending, tone: '' },
  ];

  const onToggleTodoClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const todoId = e.currentTarget.dataset.todoid;
      if (todoId) {
        toggleTodo(todoId);
      }
    },
    [toggleTodo]
  );

  const onDeleteTodoClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      const todoId = e.currentTarget.dataset.todoid;
      const todoTitle = e.currentTarget.dataset.todotitle;
      if (!todoId) return;
      const ok = await confirm({
        title: '确定要删除这条待办吗？',
        description: todoTitle ? `“${todoTitle}” 删除后不可恢复。` : '删除后不可恢复。',
        variant: 'danger',
      });
      if (ok) deleteTodo(todoId);
    },
    [deleteTodo, confirm]
  );

  return (
    <PageContainer className="space-y-6 animate-in fade-in duration-400">
      <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">待办事项</h1>
            <p className="page-subtitle">管理您的日常任务及系统自动生成的提醒事项</p>
          </div>
          <Pressable
            onClick={() => setIsAdding(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建待办
          </Pressable>
        </div>

      {/*
        催办数字。原先整页一个计数都没有，而侧栏角标只说"未完成 N 件" ——
        看不出来里面有几件已经过期。点数字即筛选。
      */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 text-xs">
        {chips.map((c) => (
          <Pressable
            key={c.id}
            type="button"
            aria-pressed={only === c.id}
            onClick={() => setOnly(c.id)}
            className={
              'rounded-full border px-2.5 py-1 transition-colors duration-200 ' +
              (c.tone ?? '') +
              (only === c.id
                ? ' border-brand-500 bg-brand-50 font-medium dark:bg-brand-500/15'
                : ' border-zinc-200 dark:border-zinc-600')
            }
          >
            {c.label} <span className="font-semibold tabular-nums">{c.n}</span>
          </Pressable>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="card-base p-6"
          >
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="todo-title" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">标题</label>
                  <Input
                    id="todo-title"
                    type="text"
                    required
                    value={newTodo.title}
                    onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
                    placeholder="要做什么？"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="todo-due-date" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">截止日期</label>
                  <Input
                    id="todo-due-date"
                    type="date"
                    value={newTodo.dueDate}
                    onChange={(e) => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="todo-description" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">描述</label>
                <Textarea
                  id="todo-description"
                  rows={3}
                  className="field-sizing-fixed resize-y"
                  value={newTodo.description}
                  onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
                  placeholder="添加更多细节…"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <Pressable
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="btn-secondary"
                >
                  取消
                </Pressable>
                <Pressable
                  type="submit"
                  className="btn-primary"
                >
                  保存待办
                </Pressable>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card-base overflow-hidden">
        {todos.length === 0 && loadError ? (
          <FailedState subject="待办清单" reason={loadError} onRetry={() => void fetchTodos()} />
        ) : sortedTodos.length === 0 ? (
          <EmptyState
            title={only === 'all' ? '暂无待办事项' : `没有「${chips.find((c) => c.id === only)?.label ?? ''}」的待办`}
            description={
              only === 'all' ? '点击右上角按钮添加您的第一个任务' : '这类暂时没有，换回「全部」看看其余待办。'
            }
            icon={ListTodo}
            action={
              only === 'all' ? (
                <Pressable
                  onClick={() => setIsAdding(true)}
                  className="btn-primary"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  立即创建
                </Pressable>
              ) : (
                <Pressable onClick={() => setOnly('all')} className="btn-secondary">
                  看全部
                </Pressable>
              )
            }
          />
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
            <AnimatePresence initial={false}>
              {sortedTodos.map((todo) => (
                <motion.div
                  key={todo.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`p-4 flex items-start space-x-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors group ${
                    todo.completed ? 'opacity-60' : ''
                  }`}
                >
                  <Pressable
                    data-todoid={todo.id}
                    onClick={onToggleTodoClick}
                    aria-label={todo.completed ? `标记为未完成：${todo.title}` : `标记为完成：${todo.title}`}
                    aria-pressed={todo.completed}
                    className={`mt-1 transition-colors ${
                      todo.completed
                        ? 'text-brand-500'
                        : 'text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400'
                    }`}
                  >
                    {todo.completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </Pressable>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`text-sm font-medium truncate ${
                          todo.completed
                            ? 'line-through text-muted-foreground'
                            : 'text-zinc-900 dark:text-white'
                        }`}
                      >
                        {todo.title}
                      </div>
                      {todo.type !== 'manual' && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${
                            todo.type === 'contract' ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
                          }`}
                        >
                          系统生成
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1 text-muted-foreground">
                      {todo.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      {todo.dueDate && (
                        <div className="flex items-center text-xs text-muted-foreground tabular-nums">
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          截止日期: {todo.dueDate}
                        </div>
                      )}
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        创建于: {formatDateTime(todo.createdAt)}
                      </div>
                    </div>
                  </div>
                  <Pressable
                    data-todoid={todo.id}
                    data-todotitle={todo.title}
                    onClick={onDeleteTodoClick}
                    className="p-2 text-muted-foreground hover:text-red-500 dark:hover:text-red-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition shrink-0"
                    aria-label={`删除待办：${todo.title}`}
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Pressable>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
