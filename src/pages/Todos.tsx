import React, { useState, useCallback, useMemo } from 'react';
import { useTodoStore } from '../store/todos';
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
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">待办事项</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理您的日常任务及系统自动生成的提醒事项</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
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
            className="bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl"
          >
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">标题</label>
                  <input
                    type="text"
                    required
                    value={newTodo.title}
                    onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200/80 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 outline-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="要做什么？"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">截止日期</label>
                  <input
                    type="date"
                    value={newTodo.dueDate}
                    onChange={(e) => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200/80 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 outline-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">描述</label>
                <textarea
                  value={newTodo.description}
                  onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-200/80 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 outline-none transition-all h-20 resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="添加更多细节..."
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg active:scale-95 transition-transform"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform"
                >
                  保存待办
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden">
        {sortedTodos.length === 0 ? (
          <EmptyState
            title="暂无待办事项"
            description="点击右上角按钮添加您的第一个任务"
            icon={ListTodo}
            action={
              <button
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                立即创建
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            <AnimatePresence initial={false}>
              {sortedTodos.map((todo) => (
                <motion.div
                  key={todo.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`p-4 flex items-start space-x-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group ${
                    todo.completed ? 'opacity-60' : ''
                  }`}
                >
                  <button
                    data-todoid={todo.id}
                    onClick={onToggleTodoClick}
                    className={`mt-1 transition-colors ${
                      todo.completed
                        ? 'text-emerald-500'
                        : 'text-slate-300 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {todo.completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3
                        className={`text-sm font-medium truncate ${
                          todo.completed
                            ? 'line-through text-slate-500 dark:text-slate-400'
                            : 'text-slate-900 dark:text-white'
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
                        todo.completed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {todo.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      {todo.dueDate && (
                        <div className="flex items-center text-xs text-slate-400 dark:text-slate-500">
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          截止日期: {todo.dueDate}
                        </div>
                      )}
                      <div className="flex items-center text-xs text-slate-400 dark:text-slate-500">
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        创建于: {new Date(todo.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    data-todoid={todo.id}
                    onClick={onDeleteTodoClick}
                    className="p-2 text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
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
  );
}
