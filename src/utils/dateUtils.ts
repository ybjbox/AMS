/**
 * 格式化通知时间：今天显示 HH:mm，其他日期显示 M月D日 HH:mm
 */
export function formatNotificationTime(isoTime: string): string {
  const d = new Date(isoTime);
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return (
    d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  );
}

export function calculateYearsOfService(joinDate: string | Date): string {
  if (!joinDate) return '0.0';
  const join = new Date(joinDate);
  const now = new Date();
  const diffTime = now.getTime() - join.getTime();
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, diffYears).toFixed(1);
}

export function calculateDaysToExpiry(expiryDate: string | Date): number {
  if (!expiryDate) return 0;
  const expiry = new Date(expiryDate);
  // Reset time to start of day for accurate day calculation
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
