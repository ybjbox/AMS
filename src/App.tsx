/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './store/auth';
import { useAppSettings } from './store/appSettings';
import { Permission } from './types';
import ConnectivityListener from './components/ConnectivityListener';

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

function ThemeApplier() {
  const { theme, systemIcon } = useAppSettings();

  React.useEffect(() => {
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
  const { user, hasPermission } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full w-full min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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

export default function App() {
  return (
    <BrowserRouter>
      <ThemeApplier />
      <ConnectivityListener />
      <AuthExpiredListener />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <Layout>
              <Suspense fallback={<LoadingFallback />}>
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
