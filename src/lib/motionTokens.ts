import { useEffect, useState } from 'react';

/**
 * JS 动效令牌（与 src/styles/transitions-tokens.css 一一对应）。
 *
 * 所有 motion/react 组件只从这里取时长与缓动；不要在组件里写 duration/ease 字面量。
 * reduced-motion 在首帧就同步读取，避免依赖库的异步探测让第一段动画照常播放。
 */
export const MOTION = {
  quick: 0.15,
  fast: 0.25,
  medium: 0.35,
  slow: 0.4,
  verySlow: 0.5,
  ease: [0.22, 1, 0.36, 1] as const,
  /** 列表 stagger：40ms/项，总预算 ≤ 200ms */
  stagger: 0.04,
  staggerMax: 5,
} as const;

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(REDUCED_QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function useMotionPrefs() {
  const reduced = usePrefersReducedMotion();
  /** 秒制过渡；reduced 时长度为 0（元素直接出现，不滑入） */
  const t = (seconds: number) => ({ duration: reduced ? 0 : seconds, ease: MOTION.ease });
  const staggerDelay = (index: number) =>
    reduced ? 0 : Math.min(index, MOTION.staggerMax) * MOTION.stagger;
  return { reduced, t, staggerDelay };
}
