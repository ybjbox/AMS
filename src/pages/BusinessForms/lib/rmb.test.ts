import { describe, it, expect } from 'vitest';
import { rmbUpper, formatAmount } from './rmb';

describe('rmbUpper 人民币大写', () => {
  it('内置业务金额与原件写法一致', () => {
    expect(rmbUpper(501)).toBe('伍佰零壹元整');
    expect(rmbUpper(888)).toBe('捌佰捌拾捌元整');
  });

  it('原件中出现的报销金额', () => {
    expect(rmbUpper(600)).toBe('陆佰元整');
    expect(rmbUpper(2986)).toBe('贰仟玖佰捌拾陆元整');
  });

  it('零的折叠与组单位', () => {
    expect(rmbUpper(100)).toBe('壹佰元整');
    expect(rmbUpper(1005)).toBe('壹仟零伍元整');
    expect(rmbUpper(10005)).toBe('壹万零伍元整');
    expect(rmbUpper(100005)).toBe('壹拾万零伍元整');
    expect(rmbUpper(100000000)).toBe('壹亿元整');
    expect(rmbUpper(100005000)).toBe('壹亿零伍仟元整');
    expect(rmbUpper(100050000)).toBe('壹亿零伍万元整');
    expect(rmbUpper(150005000)).toBe('壹亿伍仟万零伍仟元整');
  });

  it('角分', () => {
    expect(rmbUpper(0.5)).toBe('伍角');
    expect(rmbUpper(1000.05)).toBe('壹仟元零伍分');
    expect(rmbUpper(1000.5)).toBe('壹仟元伍角');
    expect(rmbUpper(0.05)).toBe('伍分');
  });

  it('非法与零值不抛异常', () => {
    expect(rmbUpper(0)).toBe('零元整');
    expect(rmbUpper(-1)).toBe('');
    expect(rmbUpper(Number.NaN)).toBe('');
  });
});

describe('formatAmount', () => {
  it('整数不带小数位，含角分保留两位', () => {
    expect(formatAmount(501)).toBe('501');
    expect(formatAmount(501.5)).toBe('501.50');
  });
});
