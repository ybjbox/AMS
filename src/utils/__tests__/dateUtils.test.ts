import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateYearsOfService, calculateDaysToExpiry } from '../dateUtils';

describe('dateUtils', () => {

  describe('calculateYearsOfService', () => {
    beforeEach(() => {
      // Mock System Time
      vi.setSystemTime(new Date('2026-04-23'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('如果没有日期，应返回 "-"', () => {
      expect(calculateYearsOfService('')).toBe('-');
    });

    it('calculateYearsOfService的正确性 (满年计算)', () => {
      expect(calculateYearsOfService('2020-04-23')).toBe('6年0个月');
    });

    it('calculateYearsOfService的正确性 (跨越年并不足月)', () => {
      expect(calculateYearsOfService('2020-05-15')).toBe('5年11个月');
    });

    it('calculateYearsOfService的正确性 (满月未跨年)', () => {
      expect(calculateYearsOfService('2025-02-23')).toBe('1年2个月');
    });
  });

  describe('calculateDaysToExpiry', () => {
    beforeEach(() => {
      // Mock System Time
      vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('如果没有日期，应返回 0', () => {
      expect(calculateDaysToExpiry('')).toBe(0);
    });

    it('calculateDaysToExpiry的正确性 (未来时间)', () => {
      // 距离今天还有几天，例如 10 天后
      expect(calculateDaysToExpiry('2026-05-03')).toBe(10);
    });

    it('calculateDaysToExpiry的正确性 (过去时间)', () => {
      expect(calculateDaysToExpiry('2026-04-18')).toBe(-5);
    });
  });
});
