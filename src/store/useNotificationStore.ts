import { create } from 'zustand';
import { toast } from 'sonner';
import { Notification } from '../types';
import { notificationApi } from '../services/notificationApi';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'time' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  clearNotifications: () => void;
}

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

function withUnread(notifications: Notification[]) {
  return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
}

// 并发去重：同一时刻只允许一个 notifications 请求在途
let notificationsInflight: Promise<void> | null = null;

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  /** 从后端拉取我的通知（recipient = 当前登录用户）。
   *  inflight 去重：并发调用复用同一 Promise（Header 挂载/路由切换场景常见）。 */
  fetchNotifications: async () => {
    if (notificationsInflight) return notificationsInflight;
    notificationsInflight = (async () => {
      set({ isLoading: true });
      try {
        const notifications = await notificationApi.list();
        set({ ...withUnread(notifications), isLoading: false });
      } catch (e) {
        set({ isLoading: false });
        toast.error(errText(e, '通知加载失败'));
      } finally {
        notificationsInflight = null;
      }
    })();
    return notificationsInflight;
  },

  /** 创建通知（本地触发如保存失败提醒也会落库，跨设备可见） */
  addNotification: (notification) => {
    notificationApi
      .create({ title: notification.title, message: notification.message, type: notification.type })
      .then((created) => set((state) => ({ ...withUnread([created, ...state.notifications]) })))
      .catch((e) => {
        // 关键：静默降级，绝不 toast/再次触发全局错误事件——
        // 否则 401 → API_ERROR → addNotification → 401 会形成无限错误循环
        console.warn('[notifications] 通知落库失败（仅本地展示）:', e);
      });
  },

  markNotificationAsRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target || target.read) return;
    set((state) => ({
      ...withUnread(state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))),
    }));
    notificationApi.markRead(id).catch(() => {
      // 回滚
      set((state) => ({
        ...withUnread(state.notifications.map((n) => (n.id === id ? { ...n, read: false } : n))),
      }));
    });
  },

  markAllNotificationsAsRead: () => {
    const prev = get().notifications;
    set({ ...withUnread(prev.map((n) => ({ ...n, read: true }))) });
    notificationApi.markAllRead().catch(() => {
      set({ ...withUnread(prev) });
      toast.error('全部已读标记失败');
    });
  },

  clearNotifications: () => {
    const prev = get().notifications;
    set(withUnread([]));
    notificationApi.clear().catch(() => {
      set(withUnread(prev));
      toast.error('通知清空失败');
    });
  },
}));
