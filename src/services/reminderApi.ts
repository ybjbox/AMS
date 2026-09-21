import { http } from './api';

/**
 * 到期提醒 API — /api/reminders（策略 HR+，见 authMiddleware POLICIES）。
 *
 * 阈值与上次扫描结果都存在服务端：提醒不该依赖某人打开浏览器，
 * 也不该让每个浏览器的 localStorage 各持一份阈值。
 */

export interface ReminderConfig {
  contractExpiryDays: number;
  probationConversionDays: number;
}

export interface ReminderItem {
  kind: 'contract' | 'probation';
  employeeId: string;
  employeeName: string;
  dueDate: string;
  daysLeft: number;
}

export interface ReminderScanReport {
  scannedAt: string;
  items: ReminderItem[];
  recipients: string[];
  created: number;
}

export interface ReminderStatus {
  lastScanAt: string | null;
  lastReport: ReminderScanReport | null;
}

export const reminderApi = {
  getConfig: (): Promise<ReminderConfig> => http.get<ReminderConfig>('/reminders/config'),
  setConfig: (patch: Partial<ReminderConfig>): Promise<ReminderConfig> =>
    http.put<ReminderConfig>('/reminders/config', patch),
  getStatus: (): Promise<ReminderStatus> => http.get<ReminderStatus>('/reminders/status'),
  scan: (): Promise<ReminderScanReport> => http.post<ReminderScanReport>('/reminders/scan'),
};
