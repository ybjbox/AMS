import React, { useState, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ children }: { children?: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const handleSetSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpen(open);
  }, []);

  const handleSetIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-900 transition-colors duration-300 flex">
      <Sidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={handleSetSidebarOpen} 
        isCollapsed={isCollapsed} 
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <Header 
          setSidebarOpen={handleSetSidebarOpen} 
          isCollapsed={isCollapsed}
          setIsCollapsed={handleSetIsCollapsed}
        />

        <main className="flex-1 overflow-auto p-6 lg:p-8 print:p-0 print:overflow-visible relative flex flex-col">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col min-h-full"
              >
                {children || <Outlet />}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm md:hidden" 
          onClick={() => handleSetSidebarOpen(false)} 
        />
      )}
    </div>
  );
}
