import React, { useState } from 'react';
import { useTodoStore } from '../store/todos';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Calendar, AlertCircle, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Todos() {
  const todos = useTodoStore(state => state.todos);
  const toggleTodo = useTodoStore(state => state.toggleTodo);
  const deleteTodo = useTodoStore(state => state.deleteTodo);
  const addTodo = useTodoStore(state => state.addTodo);
  const [isAdding, setIsAdding] = useState(false);
  const [newTodo, setNewTodo] = useState({ title: '', description: '', dueDate: '' });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.title) return;
    addTodo({
      ...newTodo,
      type: 'manual',
    });
    setNewTodo({ title: '', description: '', dueDate: '' });
    setIsAdding(false);
  };

  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">待办事项</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理您的日常任务及系统自动生成的提醒事项</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-transform shadow-sm"
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="要做什么？"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">截止日期</label>
                  <input
                    type="date"
                    value={newTodo.dueDate}
                    onChange={(e) => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">描述</label>
                <textarea
                  value={newTodo.description}
                  onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all h-20 resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-transform"
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
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ListTodo className="w-8 h-8 text-slate-300 dark:text-slate-500" />
            </div>
            <h3 className="text-slate-900 dark:text-white font-medium">暂无待办事项</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 mb-6">点击右上角按钮添加您的第一个任务</p>
            <button
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-transform shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              立即创建
            </button>
          </div>
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
                    onClick={() => toggleTodo(todo.id)}
                    className={`mt-1 transition-colors ${
                      todo.completed ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400'
                    }`}
                  >
                    {todo.completed ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <Circle className="w-6 h-6" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className={`text-sm font-medium truncate ${
                        todo.completed ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'
                      }`}>
                        {todo.title}
                      </h3>
                      {todo.type !== 'manual' && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          todo.type === 'contract' 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          系统生成
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${
                      todo.completed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'
                    }`}>
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
                    onClick={() => deleteTodo(todo.id)}
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
