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
  MANAGE_ATTENDANCE = 'MANAGE_ATTENDANCE',
}

export interface User {
  id: string;
  name: string;
  idCard: string;
  gender: string;
  age: number | string;
  phone: string;
  department: string;
  role: string;
  status: string;
  joinDate: string;
  yearsOfService: string;
  employmentType: string;
  hasSocialSecurity: string;
  contractYears: number;
  contractSignDate: string;
  contractExpiry: string;
  daysToExpiry: number | string;
  changeStatus: string;
  registeredAddress: string;
  currentAddress: string;
  isVeteran: string;
  formerUnit: string;
  militaryDates: string;
  remarks: string;
  systemRole: SystemRole;
}

export interface DepartmentNode {
  id: string;
  name: string;
  priority?: number;
  children?: DepartmentNode[];
}

export interface RoleNode {
  id: string;
  name: string;
  departmentId: string;
  priority?: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  uploadedAt: string;
  folderId: string | null;
}

export interface PrintSettings {
  duplex: boolean;
  color: boolean;
  copies: number;
}

export interface DocumentSet {
  id: string;
  name: string;
  description: string;
  documentIds: string[];
  printSettings?: Record<string, PrintSettings>;
}

export interface ContractTemplate {
  template: string;
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

export interface ApiErrorResponse {
  code?: number;
  message: string;
  details?: unknown;
}
