import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, User, Sun, Moon, Monitor, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { useAppSettings } from '../../store/appSettings';
import NotificationPanel from './NotificationPanel';

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Header({ setSidebarOpen, isCollapsed, setIsCollapsed }: HeaderProps) {
  const user = useAuth(state => state.user);
  const theme = useAppSettings(state => state.theme);
  const setTheme = useAppSettings(state => state.setTheme);

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 transition-colors duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-8 print:hidden shrink-0">
      <div className="flex items-center">
        {/* Mobile menu button */}
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="md:hidden p-2 -ml-2 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 rounded-md"
        >
          <Menu className="h-6 w-6" />
        </button>
        
        {/* Desktop collapse button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:block p-2 -ml-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
          title={isCollapsed ? "展开菜单" : "收起菜单"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center space-x-4">
        <NotificationPanel />

        <div className="flex items-center space-x-3 pl-2 border-l border-slate-200 dark:border-slate-700 relative group">
          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 cursor-pointer">
            <User className="h-5 w-5" />
          </div>
          <div className="hidden sm:flex flex-col cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-none">{user?.name || '未登录'}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-none">
              {user?.systemRole === 'SUPER_ADMIN' ? '超级管理员' : 
               user?.systemRole === 'ADMIN' ? '管理员' : 
               user?.systemRole === 'HR' ? '人事主管' : '普通员工'}
            </span>
          </div>
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full pt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-100 dark:border-slate-700 overflow-hidden">
              <div className="py-1">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">主题设置</p>
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-lg p-1">
                    <button
                      onClick={() => setTheme('light')}
                      className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                      title="浅色模式"
                    >
                      <Sun className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                      title="深色模式"
                    >
                      <Moon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setTheme('system')}
                      className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                      title="跟随系统"
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <Link to="/settings" className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">个人设置</Link>
                <Link to="/login" className="block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-slate-100 dark:border-slate-700">退出登录</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
