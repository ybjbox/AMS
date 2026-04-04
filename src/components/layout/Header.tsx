import React, { memo, useCallback } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import NotificationTrigger from './header/NotificationTrigger';
import UserMenu from './header/UserMenu';

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

const Header = memo(function Header({ setSidebarOpen, isCollapsed, setIsCollapsed }: HeaderProps) {
  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, setIsCollapsed]);

  return (
    <header className="relative z-10 h-16 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-700/50 transition-colors duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-8 print:hidden shrink-0">
      <div className="flex items-center">
        {/* Mobile menu button */}
        <button 
          onClick={handleOpenSidebar} 
          className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 rounded-xl transition-all duration-300 hover:-translate-y-0.5"
        >
          <Menu className="h-5 w-5" />
        </button>
        
        {/* Desktop collapse button */}
        <button
          onClick={handleToggleCollapse}
          className="hidden md:block p-2 -ml-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 rounded-xl transition-all duration-300 hover:-translate-y-0.5"
          title={isCollapsed ? "展开菜单" : "收起菜单"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center space-x-4">
        <NotificationTrigger />

        <div className="flex items-center space-x-3 pl-2 border-l border-zinc-200/60 dark:border-zinc-700/60">
          <UserMenu />
        </div>
      </div>
    </header>
  );
});

export default Header;
