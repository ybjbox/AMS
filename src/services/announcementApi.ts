/**
 * 公告 API（P0：公告发布）。
 * - list / listAll：list=有效公告（全员）；listAll=管理列表（ADMIN）
 * - create/update/delete：ADMIN
 */
import { http } from './api';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'important';
  publisher: string;
  createdAt: string;
  expiresAt: string;
  active: number;
}

export interface AnnouncementCreateInput {
  title: string;
  content?: string;
  priority?: 'normal' | 'important';
  expiresAt?: string;
  notifyAll?: boolean;
}

export const announcementApi = {
  /** 有效公告（全员可见；limit 可选） */
  list: (limit?: number): Promise<Announcement[]> =>
    http.get<Announcement[]>(limit ? `/announcements?limit=${limit}` : '/announcements'),

  /** 管理列表（含停用/过期，ADMIN） */
  listAll: (): Promise<Announcement[]> => http.get<Announcement[]>('/announcements/all'),

  create: (data: AnnouncementCreateInput): Promise<Announcement> =>
    http.post<Announcement>('/announcements', data),

  update: (id: string, data: Partial<AnnouncementCreateInput> & { active?: number }): Promise<Announcement> =>
    http.put<Announcement>(`/announcements/${id}`, data),

  remove: (id: string): Promise<{ success: boolean }> =>
    http.delete<{ success: boolean }>(`/announcements/${id}`),
};
