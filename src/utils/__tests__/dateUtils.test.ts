import { calculateYearsOfService, calculateDaysToExpiry } from '../dateUtils';

describe('dateUtils', () => {
  describe('calculateYearsOfService', () => {
    it('入职日期距今刚好1年', () => {
      const today = new Date();
      const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      expect(calculateYearsOfService(lastYear.toISOString())).toBe('1年0个月');
    });

    it('入职日期距今不足1年', () => {
      const today = new Date();
      const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
      const res = calculateYearsOfService(sixMonthsAgo.toISOString());
      expect(res).toMatch(/^0年\d+个月$/);
    });

    it('入职日期为空或无效', () => {
      expect(calculateYearsOfService('')).toBe('-');
    });
  });

  describe('calculateDaysToExpiry', () => {
    it('合同到期日在未来30天', () => {
      const today = new Date();
      const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const days = calculateDaysToExpiry(futureDate.toISOString());
      expect(days).toBeGreaterThan(0);
    });

    it('合同到期日已过', () => {
      const today = new Date();
      const pastDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
      expect(calculateDaysToExpiry(pastDate.toISOString())).toBeLessThanOrEqual(0);
    });

    it('到期日为空或无效', () => {
      expect(calculateDaysToExpiry('')).toBe(0);
    });
  });
});
