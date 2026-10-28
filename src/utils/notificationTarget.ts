import type { Notification } from '@/types';

/** 通知的归并键（contract:EMP0027 / probation:EMP0027）→ 可处理的对象页 */
export function notificationTarget(notification: Notification): string | null {
  const [kind, id] = (notification.refKey ?? '').split(':');
  if (!id) return null;
  if (kind === 'contract') return `/contracts?q=${encodeURIComponent(id)}`;
  if (kind === 'probation') return `/users?detail=${encodeURIComponent(id)}`;
  return null;
}
