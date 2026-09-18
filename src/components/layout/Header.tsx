import React, { memo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import NotificationTrigger from './header/NotificationTrigger';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Sidebar from './Sidebar';
import { routeConfig } from '@/config/routes';

/**
 * 移动端专用顶栏（md 以上整体隐藏）。
 * 桌面端的折叠按钮与通知铃铛已整合进侧边栏 banner（Sidebar），
 * 页眉通栏随之移除，为内容区让出整行高度。
 */
const Header = memo(function Header() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const currentRoute = routeConfig.find((r) => r.path === location.pathname);
  const pageTitle = currentRoute?.label ?? '';

  return (
    <header className="relative z-40 md:hidden h-16 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-700/50 transition-colors duration-300 flex items-center justify-between px-4 print:hidden shrink-0">
      {/* 抽屉导航 */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger className="p-2 -ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors duration-150">
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="p-0 border-none bg-transparent shadow-none data-[side=left]:w-48 data-[side=left]:sm:max-w-48"
        >
          <Sidebar
            isCollapsed={false}
            className="h-full w-full m-0 rounded-none border-r border-zinc-200/60 dark:border-zinc-700/60"
            onClose={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* 页面标题 */}
      <div className="flex-1 flex justify-center">
        {pageTitle && (
          <span className="text-sm font-semibold text-zinc-800 dark:text-white tracking-tight">
            {pageTitle}
          </span>
        )}
      </div>

      <NotificationTrigger />
    </header>
  );
});

export default Header;
