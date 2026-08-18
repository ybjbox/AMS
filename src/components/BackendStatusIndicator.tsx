import React from 'react';
import { useBackendStatus, type BackendStatus } from '@/hooks/useBackendStatus';

type Variant = 'bare' | 'pill';

interface IndicatorConfig {
  label: string;
  dot: string;
  text: string;
  ring: string;
  pulse: boolean;
  title: string;
}

const CONFIG: Record<BackendStatus, IndicatorConfig> = {
  checking: {
    label: '检测中…',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'bg-amber-500/20',
    pulse: true,
    title: '正在检测后端服务连接…',
  },
  online: {
    label: '后端在线',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'bg-emerald-500/20',
    pulse: false,
    title: '后端服务正常',
  },
  offline: {
    label: '后端离线',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    ring: 'bg-red-500/20',
    pulse: false,
    title: '无法连接后端服务，请确认服务已启动（默认端口 3000）',
  },
};

interface BackendStatusIndicatorProps {
  /** bare：仅圆点+文字，融入现有栏位；pill：带底色胶囊，适合独立悬浮 */
  variant?: Variant;
  showLabel?: boolean;
  className?: string;
}

export default function BackendStatusIndicator({
  variant = 'bare',
  showLabel = true,
  className = '',
}: BackendStatusIndicatorProps) {
  const status = useBackendStatus();
  const c = CONFIG[status];

  const container =
    variant === 'pill'
      ? 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 shadow-sm backdrop-blur select-none'
      : 'inline-flex items-center gap-1.5 select-none';

  return (
    <div className={`${container} ${className}`} title={c.title} role="status" aria-live="polite">
      <span className="relative inline-flex size-2.5 items-center justify-center" aria-hidden="true">
        {c.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.dot} opacity-75`}
          />
        )}
        <span className={`relative inline-flex size-2.5 rounded-full ${c.dot}`} />
      </span>
      {showLabel && <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>}
    </div>
  );
}
