/**
 * 系统模型每日额度的角色分档（纯函数）：
 * 超级管理员不限 → 0；管理员 / 人事主管 → adminDailyQuota；其余 → dailyQuota。
 */
import { describe, it, expect } from 'vitest';
import { quotaLimitForRole, type AiConfig } from '../aiConfigDb.ts';

const cfg = {
  dailyQuota: 20,
  adminDailyQuota: 100,
} as AiConfig;

describe('quotaLimitForRole', () => {
  it('超级管理员不限额（0）', () => {
    expect(quotaLimitForRole({ ...cfg, adminDailyQuota: 5 }, 'SUPER_ADMIN')).toBe(0);
  });

  it('管理员与人事主管共用管理档额度', () => {
    expect(quotaLimitForRole(cfg, 'ADMIN')).toBe(100);
    expect(quotaLimitForRole(cfg, 'HR')).toBe(100);
  });

  it('普通员工走员工档；角色缺失或非法时按员工档兜底', () => {
    expect(quotaLimitForRole(cfg, 'EMPLOYEE')).toBe(20);
    expect(quotaLimitForRole(cfg, undefined)).toBe(20);
    expect(quotaLimitForRole(cfg, 'ROOT')).toBe(20);
  });

  it('档位配 0 = 该档不限；负数与浮点归一为 0', () => {
    expect(quotaLimitForRole({ ...cfg, dailyQuota: 0 }, 'EMPLOYEE')).toBe(0);
    expect(quotaLimitForRole({ ...cfg, adminDailyQuota: -3 }, 'ADMIN')).toBe(0);
    expect(quotaLimitForRole({ ...cfg, adminDailyQuota: 40.7 }, 'HR')).toBe(40);
  });
});
