import { useState, useEffect } from 'react';
import { SystemRole, Permission, RolePermissions } from '../types';

interface AuthState {
  user: {
    id: string;
    name: string;
    systemRole: SystemRole;
  } | null;
}

let authState: AuthState = {
  user: {
    id: 'ADMIN001',
    name: '管理员',
    systemRole: SystemRole.SUPER_ADMIN,
  }
};

let listeners: (() => void)[] = [];

export const authStore = {
  getAuth: () => authState,
  setAuth: (newAuth: AuthState) => {
    authState = newAuth;
    listeners.forEach(l => l());
  },
  hasPermission: (permission: Permission) => {
    if (!authState.user) return false;
    const permissions = RolePermissions[authState.user.systemRole] || [];
    return permissions.includes(permission);
  },
  subscribe: (listener: () => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }
};

export function useAuth() {
  const [auth, setAuth] = useState(authStore.getAuth());
  
  useEffect(() => {
    return authStore.subscribe(() => {
      setAuth(authStore.getAuth());
    });
  }, []);
  
  return {
    ...auth,
    hasPermission: (permission: Permission) => {
      if (!auth.user) return false;
      const permissions = RolePermissions[auth.user.systemRole] || [];
      return permissions.includes(permission);
    },
    setAuth: authStore.setAuth
  };
}
