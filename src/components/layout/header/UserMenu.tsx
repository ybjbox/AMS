import React from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { useAuth } from '../../../store/auth';
import ThemeToggle from './ThemeToggle';

export default function UserMenu() {
  const user = useAuth(state => state.user);

  return (
    <div className="relative group flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200">
      <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
        <User className="h-5 w-5" />
      </div>
      <div className="hidden sm:flex flex-col">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-none">{user?.name || '未登录'}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-none">
          {user?.systemRole === 'SUPER_ADMIN' ? '超级管理员' : 
           user?.systemRole === 'ADMIN' ? '管理员' : 
           user?.systemRole === 'HR' ? '人事主管' : '普通员工'}
        </span>
      </div>
      
      {/* Dropdown Menu */}
      <div className="absolute right-0 top-full pt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right z-50">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="py-1">
            <ThemeToggle />
            <Link to="/settings" className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/50 transition-colors duration-200">个人设置</Link>
            <Link to="/login" className="block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-slate-100 dark:border-slate-700 transition-colors duration-200">退出登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
