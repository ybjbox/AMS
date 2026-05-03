import React, { memo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import NotificationTrigger from './header/NotificationTrigger';
import UserMenu from './header/UserMenu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Sidebar from './Sidebar';
import { routeConfig } from '@/config/routes';

interface HeaderProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

const Header = memo(function Header({ isCollapsed, setIsCollapsed }: HeaderProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const location = useLocation();
  const currentRoute = routeConfig.find((r) => r.path === location.pathname);
  const pageTitle = currentRoute?.label ?? '';

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, setIsCollapsed]);

  return (
    <header className="relative z-40 h-16 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-700/50 transition-colors duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-8 print:hidden shrink-0">
      <div className="flex items-center">
        {/* Mobile menu button */}
        <div className="md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger className="p-2 -ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 rounded-xl transition-all duration-300 hover:-translate-y-0.5">
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="p-0 w-64 border-none bg-transparent shadow-none"
            >
              <Sidebar
                isCollapsed={false}
                className="h-full w-full m-0 rounded-none border-r border-zinc-200/60 dark:border-zinc-700/60"
                onClose={() => setSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop collapse button */}
        <button
          onClick={handleToggleCollapse}
          className="hidden md:block p-2 -ml-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 rounded-xl transition-all duration-300 hover:-translate-y-0.5"
          title={isCollapsed ? '展开菜单' : '收起菜单'}
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {/* 移动端页面标题（仅小屏显示） */}
      <div className="flex-1 flex md:hidden justify-center">
        {pageTitle && (
          <span className="text-sm font-semibold text-zinc-800 dark:text-white tracking-tight">
            {pageTitle}
          </span>
        )}
      </div>

      {/* 桌面端面包屑辅助定位（非主标题） */}
      <div className="hidden md:flex flex-1 items-center">
        {pageTitle && (
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 tracking-wide select-none">
            {pageTitle}
          </span>
        )}
      </div>

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
