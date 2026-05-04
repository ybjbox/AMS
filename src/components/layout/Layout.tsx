import React, { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from './ErrorBoundary';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { routeConfig } from '@/config/routes';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  // 全局统一管理 document.title，根据当前路由自动更新
  const currentRoute = routeConfig.find((r) => r.path === location.pathname);
  useDocumentTitle(currentRoute?.title ?? currentRoute?.label ?? '');

  // 获取当前和前一个路由的索引，决定动画方向
  const xOffset = 12; // 水平偏移量

  const handleSetIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-900 transition-colors duration-300 flex">
      <Sidebar
        isCollapsed={isCollapsed}
        className="hidden md:flex m-4 md:my-6 md:ml-6 md:mr-0 h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)]"
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <Header isCollapsed={isCollapsed} setIsCollapsed={handleSetIsCollapsed} />

        <main className="flex-1 overflow-auto print:p-0 print:overflow-visible relative flex flex-col">
          <ErrorBoundary>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={shouldReduceMotion ? false : { opacity: 0, x: xOffset }}
                animate={{ opacity: 1, x: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, x: -xOffset }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: 'easeOut' }}
                className="flex-1 flex flex-col min-h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
