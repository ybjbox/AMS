import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMotionPrefs } from '@/lib/motionTokens';

function setMobile(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  });
}

afterEach(() => setMobile(false));

describe('动效令牌（qa-16）', () => {
  it('桌面 220ms 不缩放，stagger 上限 5 项 = 200ms', () => {
    setMobile(false);
    const { result } = renderHook(() => useMotionPrefs());
    expect(result.current.t(0.22).duration).toBeCloseTo(0.22);
    expect(result.current.staggerDelay(8)).toBeCloseTo(0.2);
  });

  it('移动端（<768）整体 ×0.8', () => {
    setMobile(true);
    const { result } = renderHook(() => useMotionPrefs());
    expect(result.current.t(0.22).duration).toBeCloseTo(0.176);
    expect(result.current.t(0.2).duration).toBeCloseTo(0.16);
    expect(result.current.staggerDelay(8)).toBeCloseTo(0.16);
  });
});
