import { Pressable } from '@/components/ui/Pressable';
import PageContainer from "@/components/PageContainer";
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTodoStore, todoUrgency } from '../store/useTodoStore';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Calendar, ListTodo, FileSignature } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FailedState } from '@/components/ui/FailedState';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatDate } from '@/utils/dateUtils';
import { useConfirm } from '@/hooks/useConfirm';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { todoApi } from '@/services/todoApi';
import RenewContractModal from '@/pages/Users/components/RenewContractModal';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { MOTION, useMotionPrefs } from '@/lib/motionTokens';
import type { Todo, User } from '@/types';

type Filter = 'all' | 'pending' | 'overdue' | 'today';

export default function Todos() {
  const { t } = useMotionPrefs();
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renewUser, setRenewUser] = useState<User | null>(null);
  const [renewTodoId, setRenewTodoId] = useState<string | null>(null);
  const [dismissTodo, setDismissTodo] = useState<Todo | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissing, setDismissing] = useState(false);
  const completeTodos = useTodoStore((state) => state.completeTodos);
  const employees = useEmployeeStore((state) => state.users);
  const fetchEmployees = useEmployeeStore((state) => state.fetchUsers);
  const navigate = useNavigate();

  useEffect(() => {
    // 续签需要员工档案；没有 users:view 的角色会失败，入口会退化为员工详情链接
    fetchEmployees().catch(() => undefined);
  }, [fetchEmployees]);

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

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const openRenew = useCallback(
    (todoId: string, targetId?: string) => {
      const user = employees.find((u) => u.id === targetId) ?? null;
      if (user) {
        setRenewUser(user);
        setRenewTodoId(todoId);
      } else if (targetId) {
        navigate(`/users?detail=${encodeURIComponent(targetId)}`);
      }
    },
    [employees, navigate]
  );

  const handleDismiss = useCallback(async () => {
    if (!dismissTodo || !dismissReason.trim()) return;
    setDismissing(true);
    try {
      const note = `
暂不续签：${dismissReason.trim()}`;
      await todoApi.update(dismissTodo.id, {
        completed: true,
        description: `${dismissTodo.description}${note}`,
      });
      toast.success('已记录暂不续签说明');
      setDismissTodo(null);
      setDismissReason('');
      await fetchTodos();
    } catch {
      toast.error('保存说明失败，请重试');
    } finally {
      setDismissing(false);
    }
  }, [dismissTodo, dismissReason, fetchTodos]);

  const handleBatchComplete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: `完成 ${selectedIds.length} 条待办？`,
      description: '合同提醒需要逐条续签，不在批量范围内。',
      confirmText: '完成',
    });
    if (!ok) return;
    const result = await completeTodos(selectedIds);
    setSelectedIds([]);
    if (result.completed > 0) toast.success(`已完成 ${result.completed} 条待办`);
  }, [selectedIds, confirm, completeTodos]);

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
    <PageContainer className="space-y-6 animate-in fade-in duration-slow">
      <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">待办事项</h1>
            <p className="page-subtitle">管理您的日常任务及系统自动生成的提醒事项</p>
          </div>
          <Button size="page" onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4" />
            新建待办
          </Button>
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
              'rounded-full border px-2.5 py-1 transition-colors duration-quick ' +
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

      {selectedIds.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/30 bg-white px-3 py-2 shadow-lg dark:bg-zinc-800"
        >
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            已选 <span className="tabular-nums">{selectedIds.length}</span> 条
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="inline" onClick={() => setSelectedIds([])}>
              取消
            </Button>
            <Button size="inline" onClick={() => void handleBatchComplete()}>
              批量完成
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={t(MOTION.fast)}
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
                <Button size="page" onClick={() => setIsAdding(true)}>
                  <Plus className="w-4 h-4" />
                  立即创建
                </Button>
              ) : (
                <Button variant="outline" size="inline" onClick={() => setOnly('all')}>
                  看全部
                </Button>
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
                  transition={t(MOTION.fast)}
                  className={`p-4 flex items-start space-x-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors group ${
                    todo.completed ? 'opacity-60' : ''
                  }`}
                >
                  {todo.type === 'contract' ? (
                    <span className="mt-1 text-amber-700 dark:text-amber-400" title="合同提醒请用续签处理">
                      <FileSignature className="w-5 h-5" aria-hidden="true" />
                      <span className="sr-only">合同提醒，需要续签</span>
                    </span>
                  ) : (
                    <span className="mt-1 flex items-center gap-2">
                      {todo.type === 'manual' && !todo.completed && (
                        <Checkbox
                          checked={selectedIds.includes(todo.id)}
                          onCheckedChange={() => toggleSelected(todo.id)}
                          aria-label={`选择待办：${todo.title}`}
                        />
                      )}
                      <Pressable
                        data-todoid={todo.id}
                        onClick={onToggleTodoClick}
                        aria-label={todo.completed ? `标记为未完成：${todo.title}` : `标记为完成：${todo.title}`}
                        aria-pressed={todo.completed}
                        className={`transition-colors ${
                          todo.completed
                            ? 'text-brand-500'
                            : 'text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400'
                        }`}
                      >
                        {todo.completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                      </Pressable>
                    </span>
                  )}
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
                  {todo.type === 'contract' && !todo.completed && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Pressable
                        type="button"
                        onClick={() => openRenew(todo.id, todo.targetId)}
                        className="btn-secondary"
                      >
                        续签
                      </Pressable>
                      <Pressable
                        type="button"
                        onClick={() => {
                          setDismissTodo(todo);
                          setDismissReason('');
                        }}
                        className="btn-secondary"
                      >
                        说明
                      </Pressable>
                    </div>
                  )}
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

      <BaseModal
        isOpen={!!dismissTodo}
        onClose={() => {
          setDismissTodo(null);
          setDismissReason('');
        }}
        title="暂不续签说明"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {dismissTodo?.title}：关闭提醒后不可恢复，说明会留在待办记录里。
          </p>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">原因（必填）</span>
            <Textarea
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="例如：员工已离职 / 合同转外包 / 待法务确认…"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Pressable
              type="button"
              className="btn-secondary"
              onClick={() => {
                setDismissTodo(null);
                setDismissReason('');
              }}
            >
              取消
            </Pressable>
            <Pressable
              type="button"
              className="btn-primary"
              disabled={!dismissReason.trim() || dismissing}
              onClick={() => void handleDismiss()}
            >
              {dismissing ? '保存中…' : '记录说明并关闭'}
            </Pressable>
          </div>
        </div>
      </BaseModal>

      <RenewContractModal
        isOpen={!!renewUser}
        user={renewUser}
        onClose={() => {
          setRenewUser(null);
          setRenewTodoId(null);
        }}
        onRenewed={() => {
          const todoId = renewTodoId;
          setRenewUser(null);
          setRenewTodoId(null);
          if (todoId) {
            void completeTodos([todoId]).then(() => fetchTodos());
          } else {
            void fetchTodos();
          }
        }}
      />
    </PageContainer>
  );
}
