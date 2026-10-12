import type { User } from '@/types';

/**
 * 合同到期分档 —— 表格徽章、顶部量级、点数字筛选，三处必须用同一份判断。
 *
 * 之前这套判断长在 `ContractTable` 的行渲染里（`hasExpiry && daysToExpiry <= 30 && > 0`），
 * 于是"页面上到底有几个人合同过期了"这个问题在界面上没有答案 —— 只能一页页翻、
 * 或者自己数红色徽章。抽出来之后量级数字和徽章不可能各说一套。
 */
export type ExpiryBucket = 'expired' | 'soon' | 'ok' | 'none';

/** 「即将到期」的窗口（天）。与提醒扫描保持一致的意图：够 HR 安排一次续签 */
export const EXPIRY_SOON_DAYS = 30;

export function expiryBucket(user: User): ExpiryBucket {
  // 没登记到期日就不能断言「已过期」：未填合同的老员工、以及被服务端读侧裁掉
  // 合同字段的低权限账号，daysToExpiry 都是 0 —— 归到「未登记」而不是「已过期」。
  if (!user.contractExpiry) return 'none';
  const days = user.daysToExpiry;
  if (days <= 0) return 'expired';
  if (days <= EXPIRY_SOON_DAYS) return 'soon';
  return 'ok';
}

export function expiryCounts(users: User[]): Record<ExpiryBucket, number> {
  const counts: Record<ExpiryBucket, number> = { expired: 0, soon: 0, ok: 0, none: 0 };
  for (const u of users) counts[expiryBucket(u)] += 1;
  return counts;
}

export const EXPIRY_BUCKET_LABEL: Record<ExpiryBucket, string> = {
  expired: '已过期',
  soon: `${EXPIRY_SOON_DAYS} 天内到期`,
  ok: '正常',
  none: '未登记到期日',
};
