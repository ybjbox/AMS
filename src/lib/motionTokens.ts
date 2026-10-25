import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * 动效令牌（与 spark-output/motion/ams-employee-portal.md 对齐）。
 *
 * Corporate：quick 120 / standard 220 / slow 320ms，统一缓动 cubic-bezier(0.2,0,0,1)；
 * 移动端（<768）整体 ×0.8。只用于"状态变化被看见"，不做装饰；
 * reduced-motion 下时长归零、位移取消（见 useMotionPrefs）。
 */
export const MOTION = {
  quick: 0.12,
  standard: 0.22,
  slow: 0.32,
  ease: [0.2, 0, 0, 1] as const,
  /** 列表 stagger：40ms/项，总预算 ≤ 200ms */
  stagger: 0.04,
  staggerMax: 5,
} as const;

const MOBILE_QUERY = '(max-width: 767px)';

function useCompactViewport() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}

export function useMotionPrefs() {
  const reduced = useReducedMotion();
  const compact = useCompactViewport();
  /** 移动端 ×0.8；reduced-motion 优先，时长直接归零 */
  const factor = compact && !reduced ? 0.8 : 1;
  /** 秒制过渡；reduced 时长度为 0（元素直接出现，不滑入） */
  const t = (seconds: number) => ({ duration: reduced ? 0 : seconds * factor, ease: MOTION.ease });
  const staggerDelay = (index: number) =>
    reduced ? 0 : Math.min(index, MOTION.staggerMax) * MOTION.stagger * factor;
  return { reduced, t, staggerDelay };
}
