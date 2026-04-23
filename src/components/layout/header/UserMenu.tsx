import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUserStore } from '@/store/useUserStore';
import ThemeToggle from './ThemeToggle';

export default function UserMenu() {
  const userInfo = useUserStore((s) => s.userInfo);
  const logout = useUserStore((s) => s.logout);
  const navigate = useNavigate();
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

  const handleLogout = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsOpen(false);
      logout();
      navigate('/login');
    },
    [logout, navigate]
  );

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <div
        onClick={toggleMenu}
        className="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors duration-200"
      >
        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <User className="h-5 w-5" />
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 leading-none">
            {userInfo?.username || '未登录'}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-none">
            {userInfo?.role === 'SUPER_ADMIN'
              ? '超级管理员'
              : userInfo?.role === 'ADMIN'
                ? '管理员'
                : userInfo?.role === 'HR'
                  ? '人事主管'
                  : '普通员工'}
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
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-100 dark:border-zinc-700 overflow-hidden z-50 origin-top-right"
          >
            <div className="py-1">
              <ThemeToggle />
              <Link
                to="/settings"
                onClick={closeMenu}
                className="block px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-700/50 transition-colors duration-200"
              >
                个人设置
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-zinc-100 dark:border-zinc-700 transition-colors duration-200"
              >
                退出登录
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
