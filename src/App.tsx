/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { useAppSettings } from './store/appSettings';
import { useAppStore } from './store/useAppStore';
import { useUserStore } from './store/useUserStore';
import ConnectivityListener from './components/ConnectivityListener';
import { useInitData } from './hooks/useInitData';
import { useTodoStore } from './store/todos';
import { EVENT_KEYS } from './config/constants';
import { Skeleton } from './components/ui/Skeleton';

const Login = lazy(() => import('./pages/Login'));
const Forbidden403 = lazy(() => import('./pages/403'));
const Dashboard = lazy(() => import('./pages/Dashboard/index'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Todos = lazy(() => import('./pages/Todos'));
const Seating = lazy(() => import('./pages/Seating'));
const NameCards = lazy(() => import('./pages/NameCards'));
const Documents = lazy(() => import('./pages/Documents'));
const Attendance = lazy(() => import('./pages/Attendance/index'));
const Contracts = lazy(() => import('./pages/Contracts'));

function DataInitializer() {
  useInitData();
  return null;
}

function ThemeApplier() {
  const theme = useAppSettings(state => state.theme);
  const systemIcon = useAppSettings(state => state.systemIcon);

  React.useLayoutEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = () => {
      root.classList.remove('light', 'dark');
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  React.useEffect(() => {
    if (systemIcon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = systemIcon;
    }
  }, [systemIcon]);

  return null;
}

function GlobalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500"></div>
      <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">系统加载中...</p>
    </div>
  );
}

function AuthExpiredListener() {
  const navigate = useNavigate();
  
  React.useEffect(() => {
    const handleAuthExpired = () => {
      navigate('/login', { replace: true });
    };
    
    window.addEventListener(EVENT_KEYS.AUTH_EXPIRED, handleAuthExpired);
    return () => window.removeEventListener(EVENT_KEYS.AUTH_EXPIRED, handleAuthExpired);
  }, [navigate]);
  
  return null;
}

function ApiErrorListener() {
  const addNotification = useTodoStore(state => state.addNotification);

  React.useEffect(() => {
    const handleApiError = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        addNotification(customEvent.detail);
      }
    };
    window.addEventListener(EVENT_KEYS.API_ERROR, handleApiError);
    return () => window.removeEventListener(EVENT_KEYS.API_ERROR, handleApiError);
  }, [addNotification]);

  return null;
}

function GlobalLoadingOverlay() {
  const globalLoading = useAppStore(state => state.globalLoading);
  
  if (!globalLoading) return null;
  
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500"></div>
        <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">处理中，请稍候...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeApplier />
      <ConnectivityListener />
      <AuthExpiredListener />
      <ApiErrorListener />
      <DataInitializer />
      <GlobalLoadingOverlay />
      <Suspense fallback={<GlobalLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/403" element={<Forbidden403 />} />
          <Route path="/*" element={
            <Layout>
              <Suspense fallback={<Skeleton className="w-full h-full min-h-[80vh] rounded-xl m-6" />}>
                <Routes>
                  <Route path="/" element={<ProtectedRoute requiredPermission="dashboard:view"><Dashboard /></ProtectedRoute>} />
                  <Route path="/users" element={<ProtectedRoute requiredPermission="users:view"><Users /></ProtectedRoute>} />
                  <Route path="/todos" element={<ProtectedRoute requiredPermission="todos:view"><Todos /></ProtectedRoute>} />
                  <Route path="/seating" element={<ProtectedRoute requiredPermission="seating:view"><Seating /></ProtectedRoute>} />
                  <Route path="/name-cards" element={<ProtectedRoute requiredPermission="name-cards:view"><NameCards /></ProtectedRoute>} />
                  <Route path="/documents" element={<ProtectedRoute requiredPermission="documents:view"><Documents /></ProtectedRoute>} />
                  <Route path="/attendance" element={<ProtectedRoute requiredPermission="attendance:view"><Attendance /></ProtectedRoute>} />
                  <Route path="/contracts" element={<ProtectedRoute requiredPermission="contracts:view"><Contracts /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute requiredPermission="settings:view"><Settings /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Layout>
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
