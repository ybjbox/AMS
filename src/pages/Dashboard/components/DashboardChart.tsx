import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import WidgetSizePicker from '@/components/ui/WidgetSizePicker';
import { resolveChartLayout, WIDGET_SIZES, type WidgetSize } from '@/config/widgetSizes';
export interface ChartData {
  name: string;
  value: number;
}
interface DashboardChartProps {
  data: ChartData[];
  isLoading: boolean;
  /**
   * 尺寸由上层（Dashboard/index.tsx 的布局记录）持有并下发：
   * 网格的 col-span 与卡片内的图表必须同源，否则会出现"图已变小但卡还占 3/5"。
   */
  size: WidgetSize;
  onSizeChange: (next: WidgetSize) => void;
  /** 切换控件放在卡片头部右侧的空白处，且只在编辑态出现 */
  editing: boolean;
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
export default function DashboardChart({ data, isLoading, size, onSizeChange, editing }: DashboardChartProps) {
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
  const hasData = data.some((d) => d.value > 0);
  const preset = WIDGET_SIZES[size];
  const layout = resolveChartLayout(size);
  // 大档才显示摘要，所以小/中档不白算
  const summary = useMemo(() => {
    if (!layout.showSummary || data.length === 0) return null;
    const values = data.map((d) => d.value);
    const peak = Math.max(...values);
    const valley = Math.min(...values);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    return { peak, valley, total, avg };
  }, [data, layout.showSummary]);

  return (
    <div className="card-base card-lift p-6">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">数据趋势</h2>
        {editing && <WidgetSizePicker value={size} onChange={onSizeChange} />}
      </div>
      {layout.showSummary && summary && !isLoading && data.length > 0 && (
        <p className="-mt-4 mb-3 text-xs text-muted-foreground">
          峰值 {summary.peak} · 谷值 {summary.valley} · 合计 {summary.total}
        </p>
      )}
      {isLoading ? (
        <div className={`${preset.chartClass} w-full animate-pulse flex items-end justify-between space-x-2 pt-10`}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-t-md"
              style={{ height: `${skeletonHeights[i - 1]}%` }}
            />
          ))}
        </div>
      ) : !hasData ? (
        <div className={`${preset.chartClass} flex items-center justify-center`}>
          <EmptyState
            icon={Activity}
            title="近 7 天暂无打卡数据"
            description="这不代表没人出勤，可能只是打卡还没导入。"
            action={
              <Link to="/attendance" className="btn-secondary">
                去考勤导入
              </Link>
            }
          />
        </div>
      ) : (
        <div className={`${preset.chartClass} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              // 左轴留 -20 是给 YAxis 的；小档不画 YAxis，就不必留这段空白
              margin={{ top: 10, right: 10, left: layout.showAxis ? -20 : 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              {layout.showGrid && (
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={borderColor} />
              )}
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: mutedFgColor }}
                // 小档只留首尾两个日期：160px 高配 7 个标签会糊成一片
                interval={layout.sparseTicks ? 'preserveStartEnd' : 0}
                dy={10}
              />
              {layout.showAxis && (
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: mutedFgColor }}
                  width={40}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: popoverColor,
                  borderRadius: '8px',
                  border: `1px solid ${borderColor}`,
                  boxShadow: 'var(--shadow-md)',
                }}
                itemStyle={{ color: fgColor, fontWeight: 500 }}
              />
              {summary && (
                <ReferenceLine
                  y={summary.avg}
                  stroke={mutedFgColor}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: '均值', position: 'insideTopRight', fontSize: 11, fill: mutedFgColor }}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={primaryColor}
                strokeWidth={size === 'small' ? 2 : 3}
                // 关动画有两个理由：档位切换时容器高度突变，补间会抖；以及数据点标记
                // 在动画中途不渲染，大档会看起来"缺点"。
                isAnimationActive={false}
                dot={layout.showDots ? { r: 3, fill: primaryColor, strokeWidth: 0 } : false}
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
