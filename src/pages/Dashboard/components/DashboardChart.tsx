import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { useAppSettings } from '../../../store/appSettings';

export interface ChartData {
  name: string;
  value: number;
}

interface DashboardChartProps {
  data: ChartData[];
  isLoading: boolean;
}

export default function DashboardChart({ data, isLoading }: DashboardChartProps) {
  const theme = useAppSettings((state) => state.theme);
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const gridColor = isDark ? '#3f3f46' : '#e4e4e7';
  const tickColor = isDark ? '#a1a1aa' : '#71717a';
  const tooltipBg = isDark ? 'rgba(39,39,42,0.95)' : 'rgba(255,255,255,0.95)';
  const tooltipTextColor = isDark ? '#f4f4f5' : '#18181b';
  const skeletonHeights = [60, 85, 70, 95, 75, 55, 40];

  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 shadow-sm rounded-2xl p-6 lg:col-span-2 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">数据趋势</h2>
      </div>

      {isLoading ? (
        <div className="h-[300px] w-full animate-pulse flex items-end justify-between space-x-2 pt-10">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-t-md" style={{ height: `${skeletonHeights[i-1]}%` }}></div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[300px] text-zinc-500 dark:text-zinc-400">
          <Activity className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium">暂无图表数据</p>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: tickColor }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: tickColor }} 
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: tooltipBg, 
                  borderRadius: '8px',
                  border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }} 
                itemStyle={{ color: tooltipTextColor, fontWeight: 500 }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#3b82f6" 
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
