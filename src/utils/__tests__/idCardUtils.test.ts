import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateIdCard, calculateAge, getGender } from '../idCardUtils';

describe('idCardUtils', () => {

  describe('generateIdCard', () => {
    it('generateIdCard 生成的身份证号格式正确', () => {
      const idCard = generateIdCard();
      expect(idCard).toHaveLength(18);
      // Validates basic parts: '440106' followed by Year Month Day, etc.
      expect(idCard).toMatch(/^440106\d{4}\d{2}\d{2}\d{4}$/);
    });
  });

  describe('calculateAge', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-04-23'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('无效身份证时返回 0', () => {
      expect(calculateAge('')).toBe(0);
      expect(calculateAge('123')).toBe(0);
    });

    it('calculateAge计算正确 (刚过生日)', () => {
      // 1990-04-20
      expect(calculateAge('440106199004201234')).toBe(36);
    });

    it('calculateAge计算正确 (还未过生日)', () => {
      // 1990-10-15
      expect(calculateAge('440106199010151234')).toBe(35);
    });
  });

  describe('getGender', () => {
    it('getGender判断正确 (偶数为女)', () => {
      // 第17位是 2 -> 偶数
      expect(getGender('440106199010151224')).toBe('女');
    });

    it('getGender判断正确 (奇数为男)', () => {
      // 第17位是 1 -> 奇数
      expect(getGender('440106199010151214')).toBe('男');
    });

    it('无效身份证默认返回 男', () => {
      expect(getGender('')).toBe('男');
    });
  });
});
