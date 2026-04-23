import React, { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

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

        <main className="flex-1 overflow-auto p-6 lg:p-8 print:p-0 print:overflow-visible relative flex flex-col">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
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
