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

export interface ApiErrorResponse {
  code?: number;
  message: string;
  details?: unknown;
}
