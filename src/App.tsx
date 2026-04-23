/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { useLoadingStore } from './store/appSettings';
import ConnectivityListener from './components/ConnectivityListener';
import { Toaster } from 'sonner';
import { ConfirmProvider } from './hooks/useConfirm';
import { Skeleton } from '@/components/ui/Skeleton';
import { routeConfig } from './config/routes';
import { useAppLifecycle } from './hooks/useAppLifecycle';

const Login = lazy(() => import('./pages/Login'));
const Forbidden403 = lazy(() => import('./pages/403'));

function AppLifecycleManager() {
  useAppLifecycle();
  return null;
}

function GlobalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-zinc-200 border-t-blue-600 dark:border-zinc-700 dark:border-t-blue-500"></div>
      <p className="mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">系统加载中...</p>
    </div>
  );
}

function GlobalLoadingOverlay() {
  const globalLoading = useLoadingStore((state) => state.globalLoading);

  if (!globalLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-xl flex flex-col items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-zinc-200 border-t-blue-600 dark:border-zinc-700 dark:border-t-blue-500"></div>
        <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">处理中，请稍候...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <AppLifecycleManager />
        <ConnectivityListener />
        <GlobalLoadingOverlay />
        <Toaster position="top-center" richColors />
        <Suspense fallback={<GlobalLoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/403" element={<Forbidden403 />} />
            <Route
              element={
                <Layout>
                  <Suspense fallback={<Skeleton className="w-full h-full min-h-[80vh] rounded-xl m-6" />}>
                    <Outlet />
                  </Suspense>
                </Layout>
              }
            >
              {routeConfig.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={
                    <ProtectedRoute requiredPermission={route.permission}>
                      <route.component />
                    </ProtectedRoute>
                  }
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ConfirmProvider>
    </BrowserRouter>
  );
}
