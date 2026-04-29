import React, { useState, useCallback, useMemo } from 'react';
import { useTodoStore } from '../store/useTodoStore';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Calendar, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Todos() {
  const todos = useTodoStore((state) => state.todos);
  const toggleTodo = useTodoStore((state) => state.toggleTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const addTodo = useTodoStore((state) => state.addTodo);
  const [isAdding, setIsAdding] = useState(false);
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
    return [...todos].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [todos]);

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
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const todoId = e.currentTarget.dataset.todoid;
      if (todoId) {
        deleteTodo(todoId);
      }
    },
    [deleteTodo]
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 w-full min-h-full">
      <div className="max-w-3xl mx-auto space-y-6 w-full">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">待办事项</h1>
            <p className="page-subtitle">管理您的日常任务及系统自动生成的提醒事项</p>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建待办
          </button>
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
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">标题</label>
                  <input
                    type="text"
                    required
                    value={newTodo.title}
                    onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
                    className="input-base"
                    placeholder="要做什么？"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">截止日期</label>
                  <input
                    type="date"
                    value={newTodo.dueDate}
                    onChange={(e) => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                    className="input-base"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">描述</label>
                <textarea
                  value={newTodo.description}
                  onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
                  className="input-base h-20 resize-none"
                  placeholder="添加更多细节..."
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  保存待办
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card-base overflow-hidden">
        {sortedTodos.length === 0 ? (
          <EmptyState
            title="暂无待办事项"
            description="点击右上角按钮添加您的第一个任务"
            icon={ListTodo}
            action={
              <button
                onClick={() => setIsAdding(true)}
                className="btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                立即创建
              </button>
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
                  <button
                    data-todoid={todo.id}
                    onClick={onToggleTodoClick}
                    className={`mt-1 transition-colors ${
                      todo.completed
                        ? 'text-emerald-500'
                        : 'text-zinc-300 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {todo.completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3
                        className={`text-sm font-medium truncate ${
                          todo.completed
                            ? 'line-through text-zinc-500 dark:text-zinc-400'
                            : 'text-zinc-900 dark:text-white'
                        }`}
                      >
                        {todo.title}
                      </h3>
                      {todo.type !== 'manual' && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            todo.type === 'contract' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          系统生成
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm mt-1 ${
                        todo.completed ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {todo.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      {todo.dueDate && (
                        <div className="flex items-center text-xs text-zinc-400 dark:text-zinc-500">
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          截止日期: {todo.dueDate}
                        </div>
                      )}
                      <div className="flex items-center text-xs text-zinc-400 dark:text-zinc-500">
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        创建于: {new Date(todo.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    data-todoid={todo.id}
                    onClick={onDeleteTodoClick}
                    className="p-2 text-zinc-300 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
