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
