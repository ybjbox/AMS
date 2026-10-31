import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MOTION, useMotionPrefs } from '@/lib/motionTokens';

function setReduced(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : false,
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

afterEach(() => setReduced(false));

describe('动效令牌（qa-16 / S2）', () => {
  it('时长与缓动和 CSS token 一致', () => {
    setReduced(false);
    const { result } = renderHook(() => useMotionPrefs());
    expect(result.current.t(MOTION.quick).duration).toBeCloseTo(0.15);
    expect(result.current.t(MOTION.fast).duration).toBeCloseTo(0.25);
    expect(result.current.t(MOTION.slow).duration).toBeCloseTo(0.4);
    expect(result.current.t(MOTION.fast).ease).toEqual([0.22, 1, 0.36, 1]);
    expect(result.current.staggerDelay(8)).toBeCloseTo(0.2);
  });

  it('reduced-motion 首帧即归零，stagger 同归零', () => {
    setReduced(true);
    const { result } = renderHook(() => useMotionPrefs());
    expect(result.current.reduced).toBe(true);
    expect(result.current.t(MOTION.fast).duration).toBe(0);
    expect(result.current.staggerDelay(8)).toBe(0);
  });
});
