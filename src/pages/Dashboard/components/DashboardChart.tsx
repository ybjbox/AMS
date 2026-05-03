import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { EmptyState } from '@/components/ui/EmptyState';
export interface ChartData {
  name: string;
  value: number;
}
interface DashboardChartProps {
  data: ChartData[];
  isLoading: boolean;
}
/** 从 CSS 变量读取 oklch 颜色，转为 recharts 可用的字符串 */
function useCssVar(varName: string): string {
  const [value, setValue] = useState('');
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setValue(getComputedStyle(root).getPropertyValue(varName).trim());
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', read);
    };
  }, [varName]);
  return value;
}
export default function DashboardChart({ data, isLoading }: DashboardChartProps) {
  const theme = useAppSettings((state) => state.theme);
  // 使用 CSS 变量，自动跟随深色/浅色模式
  const primaryColor = useCssVar('--primary') || 'oklch(0.62 0.19 250)';
  const borderColor = useCssVar('--border') || 'oklch(0.87 0 0)';
  const mutedFgColor = useCssVar('--muted-foreground') || 'oklch(0.50 0 0)';
  const popoverColor = useCssVar('--popover') || 'oklch(1 0 0)';
  const fgColor = useCssVar('--foreground') || 'oklch(0.30 0 0)';
  const skeletonHeights = [60, 85, 70, 95, 75, 55, 40];
  // theme 变量保留以备未来扩展使用
  void theme;
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
