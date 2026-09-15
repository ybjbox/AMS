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
  if (!joinDate) return '-';
  const join = new Date(joinDate);
  if (isNaN(join.getTime())) return '-';
  const now = new Date();
  let years = now.getFullYear() - join.getFullYear();
  let months = now.getMonth() - join.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < join.getDate())) {
    years--;
    months += 12;
  }
  if (years < 0) return '-';
  return `${years}年${months}个月`;
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

/**
 * 统一日期格式为 YYYY-MM-DD（全站标准格式）。
 * 兼容 string / Date / 空值：无效输入返回 '-'。
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 统一日期时间格式为 YYYY-MM-DD HH:mm（全站标准格式）。
 * 兼容 string / Date / 空值：无效输入返回 '-'。
 */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '-';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)} ${hh}:${mm}`;
}

/**
 * 手机号分组显示：11 位号码按 3-4-4 分组（如 133 4330 0978）；
 * 其他长度原样返回；空值返回 '-'。
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const digits = phone.replace(/\s+/g, '');
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

/**
 * 手机号脱敏：11 位号码中段 4 位星号（如 133****0978），用于列表等
 * 多人可见的场合；详情页可展示完整号码（或后续按权限放开）。
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const digits = phone.replace(/\s+/g, '');
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}****${digits.slice(7)}`;
  }
  return phone;
}
