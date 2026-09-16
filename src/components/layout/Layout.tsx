import React, { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from './ErrorBoundary';
import AiAssistant from '@/components/AiAssistant';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { routeConfig } from '@/config/routes';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  // 全局统一管理 document.title，根据当前路由自动更新
  const currentRoute = routeConfig.find((r) => r.path === location.pathname);
  useDocumentTitle(currentRoute?.title ?? currentRoute?.label ?? '');

  const handleSetIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-background transition-colors duration-300 flex">
      {/* 键盘用户跳转链接（Tab 首次聚焦可见） */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        跳到主内容
      </a>
      <Sidebar
        isCollapsed={isCollapsed}
        className="hidden md:flex m-4 md:my-6 md:ml-6 md:mr-0 h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)]"
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <Header isCollapsed={isCollapsed} setIsCollapsed={handleSetIsCollapsed} />

        <main id="main-content" className="flex-1 overflow-auto print:p-0 print:overflow-visible relative flex flex-col">
          <ErrorBoundary>
            {/* 路由切换动画：用 CSS 动画（tw-animate-css）替代 motion 的 AnimatePresence。
                AnimatePresence + keyed motion.div 会导致页面组件双挂载（unmount→mount 两次，
                每个页面的挂载副作用执行两遍 → API 请求翻倍、初始化逻辑重复）。
                CSS 方案：key 变化时新页面直接挂载一次并播放一次入场动画；
                prefers-reduced-motion 由 index.css 的全局媒体查询统一降级。 */}
            <div
              key={location.pathname}
              className="flex-1 flex flex-col min-h-full animate-in fade-in slide-in-from-right-2 duration-200 ease-out"
            >
              {children}
            </div>
          </ErrorBoundary>
        </main>

        {/* AI 助手（自带悬浮按钮）。后端连通性状态已移入侧边栏底部（原固定左下角胶囊会与分页/内容抢位）。 */}
        <AiAssistant />
      </div>
    </div>
  );
}
