import { http } from './api';
import type { Notification } from '../types';

export interface NotificationCreateInput {
  title: string;
  message?: string;
  type?: Notification['type'];
  /** 接收人 username；不传默认当前登录用户（HR/ADMIN 可指定他人） */
  recipient?: string;
}

export const notificationApi = {
  list: () => http.get<Notification[]>('/notifications'),
  create: (data: NotificationCreateInput) => http.post<Notification>('/notifications', data),
  markRead: (id: string) => http.put(`/notifications/${id}/read`),
  markAllRead: () => http.put(`/notifications/read-all`),
  clear: () => http.delete(`/notifications`),
  remove: (id: string) => http.delete(`/notifications/${id}`),
};
