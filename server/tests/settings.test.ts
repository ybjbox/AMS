/**
 * settingsDb 服务端单测示例（vitest node project 首个用例）。
 * 运行环境：vitest 的 server project 以 environment: node + 独立 DATA_DIR 执行，
 * 与开发库（data/ams.db）完全隔离。
 */
import { describe, it, expect } from 'vitest';
import { getSetting, setSetting, getThemes, setThemes } from '../settingsDb.ts';

describe('settingsDb（node:sqlite key-value 层）', () => {
  it('set/get 往返一致（对象值）', () => {
    setSetting('test:roundtrip', { a: 1, b: 'x' });
    expect(getSetting('test:roundtrip')).toEqual({ a: 1, b: 'x' });
  });

  it('同名 key 覆盖写', () => {
    setSetting('test:overwrite', 1);
    setSetting('test:overwrite', 2);
    expect(getSetting('test:overwrite')).toBe(2);
  });

  it('读不存在的 key 返回 undefined 且不抛错', () => {
    expect(getSetting('test:missing')).toBeUndefined();
  });

  it('themes 便捷封装往返', () => {
    setThemes({ default: { titleFill: 'FF000001' } });
    expect(getThemes()?.default?.titleFill).toBe('FF000001');
  });
});
