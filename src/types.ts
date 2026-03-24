export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE',
}

export enum Permission {
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_USERS = 'VIEW_USERS',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  VIEW_SETTINGS = 'VIEW_SETTINGS',
}

export const RolePermissions: Record<SystemRole, Permission[]> = {
  [SystemRole.SUPER_ADMIN]: [
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_USERS,
    Permission.VIEW_USERS,
    Permission.MANAGE_SETTINGS,
    Permission.VIEW_SETTINGS,
  ],
  [SystemRole.ADMIN]: [
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_USERS,
    Permission.VIEW_USERS,
    Permission.VIEW_SETTINGS,
  ],
  [SystemRole.HR]: [
    Permission.VIEW_DASHBOARD,
    Permission.MANAGE_USERS,
    Permission.VIEW_USERS,
  ],
  [SystemRole.EMPLOYEE]: [
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_USERS,
  ],
};

export interface User {
  id: string;
  name: string;
  systemRole: SystemRole;
  // ... other fields
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  type: 'contract' | 'probation' | 'manual';
  targetId?: string; // Employee ID
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
}

export interface ReminderSettings {
  contractExpiryDays: number;
  probationConversionDays: number;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: 'normal' | 'late' | 'early' | 'absent' | 'leave';
  workHours: number;
}
