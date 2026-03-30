import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../../store/auth';
import ThemeToggle from './ThemeToggle';

export default function UserMenu() {
  const user = useAuth(state => state.user);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
      >
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
      </div>
      
      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 origin-top-right"
          >
            <div className="py-1">
              <ThemeToggle />
              <Link to="/settings" onClick={() => setIsOpen(false)} className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/50 transition-colors duration-200">个人设置</Link>
              <Link to="/login" onClick={() => setIsOpen(false)} className="block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-slate-100 dark:border-slate-700 transition-colors duration-200">退出登录</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
