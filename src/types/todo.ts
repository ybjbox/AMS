export interface Todo {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  type: 'contract' | 'probation' | 'manual';
  targetId?: string;
  createdAt: string;
}

export interface ReminderSettings {
  contractExpiryDays: number;
  probationConversionDays: number;
}
