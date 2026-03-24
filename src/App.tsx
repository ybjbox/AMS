/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Todos from './pages/Todos';
import Seating from './pages/Seating';
import NameCards from './pages/NameCards';
import Documents from './pages/Documents';
import Attendance from './pages/Attendance';
import Contracts from './pages/Contracts';
import { useAuth } from './store/auth';
import { useAppSettings } from './store/appSettings';
import { Permission } from './types';
import ConnectivityListener from './components/ConnectivityListener';

function ThemeApplier() {
  const { theme, systemIcon } = useAppSettings();

  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
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

function PageContainer() {
  const location = useLocation();
  const { user, hasPermission } = useAuth();
  const [visitedRoutes, setVisitedRoutes] = useState<Set<string>>(new Set([location.pathname]));

  useEffect(() => {
    setVisitedRoutes(prev => {
      if (prev.has(location.pathname)) return prev;
      const newSet = new Set(prev);
      newSet.add(location.pathname);
      return newSet;
    });
  }, [location.pathname]);
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const routePermissions: Record<string, Permission> = {
    '/': Permission.VIEW_DASHBOARD,
    '/users': Permission.VIEW_USERS,
    '/todos': Permission.VIEW_DASHBOARD,
    '/seating': Permission.VIEW_DASHBOARD,
    '/name-cards': Permission.VIEW_DASHBOARD,
    '/documents': Permission.VIEW_DASHBOARD,
    '/attendance': Permission.VIEW_DASHBOARD,
    '/contracts': Permission.VIEW_DASHBOARD,
    '/settings': Permission.VIEW_SETTINGS,
  };

  const currentPermission = routePermissions[location.pathname];

  if (currentPermission === undefined) {
    return <Navigate to="/" replace />;
  }

  if (!hasPermission(currentPermission)) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {visitedRoutes.has('/') && (
        <div style={{ display: location.pathname === '/' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <Dashboard />}
        </div>
      )}
      {visitedRoutes.has('/users') && (
        <div style={{ display: location.pathname === '/users' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_USERS) && <Users />}
        </div>
      )}
      {visitedRoutes.has('/todos') && (
        <div style={{ display: location.pathname === '/todos' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <Todos />}
        </div>
      )}
      {visitedRoutes.has('/seating') && (
        <div style={{ display: location.pathname === '/seating' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <Seating />}
        </div>
      )}
      {visitedRoutes.has('/name-cards') && (
        <div style={{ display: location.pathname === '/name-cards' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <NameCards />}
        </div>
      )}
      {visitedRoutes.has('/documents') && (
        <div style={{ display: location.pathname === '/documents' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <Documents />}
        </div>
      )}
      {visitedRoutes.has('/attendance') && (
        <div style={{ display: location.pathname === '/attendance' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <Attendance />}
        </div>
      )}
      {visitedRoutes.has('/contracts') && (
        <div style={{ display: location.pathname === '/contracts' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_DASHBOARD) && <Contracts />}
        </div>
      )}
      {visitedRoutes.has('/settings') && (
        <div style={{ display: location.pathname === '/settings' ? 'block' : 'none', height: '100%' }}>
          {hasPermission(Permission.VIEW_SETTINGS) && <Settings />}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeApplier />
      <ConnectivityListener />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <Layout>
            <PageContainer />
          </Layout>
        } />
      </Routes>
    </BrowserRouter>
  );
}
