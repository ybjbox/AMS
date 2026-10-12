import { describe, it, expect } from 'vitest';
import { expiryBucket, expiryCounts, EXPIRY_SOON_DAYS } from './expiryBucket';
import type { User } from '@/types';

const u = (over: Partial<User> = {}): User =>
  ({ contractExpiry: '2026-11-01', daysToExpiry: 20, ...over }) as User;

describe('合同到期分档', () => {
  it('边界：0 天与负数是已过期，1 到 30 天是即将到期，31 天起正常', () => {
    expect(expiryBucket(u({ daysToExpiry: -5 }))).toBe('expired');
    expect(expiryBucket(u({ daysToExpiry: 0 }))).toBe('expired');
    expect(expiryBucket(u({ daysToExpiry: 1 }))).toBe('soon');
    expect(expiryBucket(u({ daysToExpiry: EXPIRY_SOON_DAYS }))).toBe('soon');
    expect(expiryBucket(u({ daysToExpiry: EXPIRY_SOON_DAYS + 1 }))).toBe('ok');
  });

  it('没登记到期日单独一档 —— 否则未填合同的老员工会被算成集体过期', () => {
    expect(expiryBucket(u({ contractExpiry: '', daysToExpiry: 0 }))).toBe('none');
    expect(expiryBucket(u({ contractExpiry: null as unknown as string }))).toBe('none');
  });

  it('四档加起来就是人数，没有漏档也没有重复计', () => {
    const users = [u({ daysToExpiry: -1 }), u({ daysToExpiry: 3 }), u({ daysToExpiry: 400 }), u({ contractExpiry: '' }), u()];
    const c = expiryCounts(users);
    expect(c).toEqual({ expired: 1, soon: 2, ok: 1, none: 1 });
    expect(c.expired + c.soon + c.ok + c.none).toBe(users.length);
  });
});
