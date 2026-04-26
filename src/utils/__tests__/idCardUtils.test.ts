import { generateIdCard, calculateAge, getGender } from '../idCardUtils';

describe('idCardUtils', () => {
  describe('generateIdCard', () => {
    it('生成的身份证号应为18位', () => {
      expect(generateIdCard().length).toBe(18);
    });

    it('生成的身份证号应全为数字（最后一位可为X）', () => {
      const idCard = generateIdCard();
      expect(idCard).toMatch(/^\d{17}[\dX]$/);
    });
  });

  describe('calculateAge', () => {
    it('传入有效身份证号 → 应返回正确年龄（number类型）', () => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const birthYear = currentYear - 30; // 30 years ago
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const idCard = `440106${birthYear}${month}${day}1234`;
      const age = calculateAge(idCard);
      expect(typeof age).toBe('number');
      expect(age).toBe(30);
    });
  });

  describe('getGender', () => {
    it('身份证号第17位为奇数 → 应返回 "男"', () => {
      expect(getGender('440106199001011234')).toBe('男');
    });

    it('身份证号第17位为偶数 → 应返回 "女"', () => {
      expect(getGender('440106199001011244')).toBe('女');
    });
  });
});
