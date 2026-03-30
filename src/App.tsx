/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { useAuth } from './store/auth';
import { useAppSettings } from './store/appSettings';
import { Permission } from './types';
import ConnectivityListener from './components/ConnectivityListener';
import { useInitData } from './hooks/useInitData';
import { useTodoStore } from './store/todos';

const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Users = React.lazy(() => import('./pages/Users'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Todos = React.lazy(() => import('./pages/Todos'));
const Seating = React.lazy(() => import('./pages/Seating'));
const NameCards = React.lazy(() => import('./pages/NameCards'));
const Documents = React.lazy(() => import('./pages/Documents'));
const Attendance = React.lazy(() => import('./pages/Attendance'));
const Contracts = React.lazy(() => import('./pages/Contracts'));

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

function ProtectedRoute({ children, permission }: { children: React.ReactNode, permission: Permission }) {
  const user = useAuth(state => state.user);
  const hasPermission = useAuth(state => state.hasPermission);
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function GlobalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500"></div>
      <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">系统加载中...</p>
    </div>
  );
}

function PageLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500"></div>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">加载页面中...</p>
    </div>
  );
}

function AuthExpiredListener() {
  const navigate = useNavigate();
  
  React.useEffect(() => {
    const handleAuthExpired = () => {
      navigate('/login', { replace: true });
    };
    
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
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
    window.addEventListener('api:error', handleApiError);
    return () => window.removeEventListener('api:error', handleApiError);
  }, [addNotification]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeApplier />
      <ConnectivityListener />
      <AuthExpiredListener />
      <ApiErrorListener />
      <DataInitializer />
      <Suspense fallback={<GlobalLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <Layout>
              <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  <Route path="/" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><Dashboard /></ProtectedRoute>} />
                  <Route path="/users" element={<ProtectedRoute permission={Permission.VIEW_USERS}><Users /></ProtectedRoute>} />
                  <Route path="/todos" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><Todos /></ProtectedRoute>} />
                  <Route path="/seating" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><Seating /></ProtectedRoute>} />
                  <Route path="/name-cards" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><NameCards /></ProtectedRoute>} />
                  <Route path="/documents" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><Documents /></ProtectedRoute>} />
                  <Route path="/attendance" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><Attendance /></ProtectedRoute>} />
                  <Route path="/contracts" element={<ProtectedRoute permission={Permission.VIEW_DASHBOARD}><Contracts /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute permission={Permission.VIEW_SETTINGS}><Settings /></ProtectedRoute>} />
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
