import React from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import NotificationTrigger from './header/NotificationTrigger';
import UserMenu from './header/UserMenu';

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Header({ setSidebarOpen, isCollapsed, setIsCollapsed }: HeaderProps) {
  return (
    <header className="relative z-10 h-16 bg-white/95 dark:bg-slate-800/90 backdrop-blur-sm shadow-sm border-b border-slate-200 dark:border-slate-700 transition-colors duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-8 print:hidden shrink-0">
      <div className="flex items-center">
        {/* Mobile menu button */}
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="md:hidden p-2 -ml-2 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors duration-200"
        >
          <Menu className="h-6 w-6" />
        </button>
        
        {/* Desktop collapse button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:block p-2 -ml-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors duration-200"
          title={isCollapsed ? "展开菜单" : "收起菜单"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center space-x-4">
        <NotificationTrigger />

        <div className="flex items-center space-x-3 pl-2 border-l border-slate-200 dark:border-slate-700">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
