import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
export interface ChartData {
  name: string;
  value: number;
}
interface DashboardChartProps {
  data: ChartData[];
  isLoading: boolean;
}
/** 批量读取多个 CSS 变量，共享单一 MutationObserver */
function useCssVars<T extends readonly string[]>(
  varNames: T
): Record<T[number], string> {
  const [values, setValues] = useState<Record<string, string>>(() => {
    return Object.fromEntries(varNames.map((v) => [v, ''])) as Record<string, string>;
  });
  useEffect(() => {
    const root = document.documentElement;
    let rafId: number | null = null;
    const read = () => {
      // 使用 rAF 合并多次快速触发，避免同步调用 getComputedStyle 造成布局抖动
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const computed = getComputedStyle(root);
        setValues(
          Object.fromEntries(varNames.map((v) => [v, computed.getPropertyValue(v).trim()])) as Record<string, string>
        );
      });
    };
    // 首次立即读取
    const computed = getComputedStyle(root);
    setValues(
      Object.fromEntries(varNames.map((v) => [v, computed.getPropertyValue(v).trim()])) as Record<string, string>
    );
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', read);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // varNames 为编译期常量，不需要进入依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values as Record<T[number], string>;
}
export default function DashboardChart({ data, isLoading }: DashboardChartProps) {
  // 使用 CSS 变量，自动跟随深色/浅色模式
  const cssVars = useCssVars([
    '--primary',
    '--border',
    '--muted-foreground',
    '--popover',
    '--foreground',
  ] as const);
  const primaryColor  = cssVars['--primary']          || 'oklch(0.62 0.19 250)';
  const borderColor   = cssVars['--border']            || 'oklch(0.87 0 0)';
  const mutedFgColor  = cssVars['--muted-foreground']  || 'oklch(0.50 0 0)';
  const popoverColor  = cssVars['--popover']           || 'oklch(1 0 0)';
  const fgColor       = cssVars['--foreground']        || 'oklch(0.30 0 0)';
  const skeletonHeights = [60, 85, 70, 95, 75, 55, 40];
  return (
    <div className="card-base p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">数据趋势</h2>
      </div>
      {isLoading ? (
        <div className="h-[300px] w-full animate-pulse flex items-end justify-between space-x-2 pt-10">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-t-md"
              style={{ height: `${skeletonHeights[i - 1]}%` }}
            />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center">
          <EmptyState icon={Activity} title="暂无图表数据" description="数据加载完成后将在此处显示趋势图" />
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={borderColor} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: mutedFgColor }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: mutedFgColor }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: popoverColor,
                  borderRadius: '8px',
                  border: `1px solid ${borderColor}`,
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
                itemStyle={{ color: fgColor, fontWeight: 500 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={primaryColor}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
