import { useState, useEffect } from 'react';
import { Users, Briefcase, FileText, Activity, Building2, Settings, LucideIcon } from 'lucide-react';
import { ChartData } from '../components/DashboardChart';

export interface StatItem {
  name: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  color: string;
  bg: string;
}

export interface NoticeItem {
  title: string;
  dept: string;
  date: string;
  isNew: boolean;
}

export interface QuickActionItem {
  name: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

export interface UseDashboardReturn {
  stats: StatItem[];
  notices: NoticeItem[];
  quickActions: QuickActionItem[];
  chartData: ChartData[];
  lastUpdated: string;
  isLoading: boolean;
}

export function useDashboard(): UseDashboardReturn {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const stats: StatItem[] = [
    { name: '总员工数', value: '1,240', change: '+12%', trend: 'up', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { name: '今日出勤', value: '1,180', change: '+2.1%', trend: 'up', icon: Activity, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { name: '待办审批', value: '24', change: '-5', trend: 'down', icon: FileText, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { name: '部门数量', value: '12', change: '0', trend: 'neutral', icon: Briefcase, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
  ];

  const notices: NoticeItem[] = [
    { title: '关于2026年端午节放假安排的通知', dept: '行政部', date: '2026-03-10', isNew: true },
    { title: '系统V2.0版本更新说明及功能介绍', dept: 'IT部', date: '2026-03-08', isNew: false },
    { title: '第一季度优秀员工表彰决定', dept: '人事部', date: '2026-03-01', isNew: false },
  ];

  const quickActions: QuickActionItem[] = [
    { name: '添加员工', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    {
      name: '发起审批',
      icon: FileText,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    },
    {
      name: '部门调整',
      icon: Building2,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-900/30',
    },
    {
      name: '系统设置',
      icon: Settings,
      color: 'text-zinc-600 dark:text-zinc-400',
      bg: 'bg-zinc-50 dark:bg-zinc-800',
    },
  ];

  const chartData: ChartData[] = [
    { name: '周一', value: 1120 },
    { name: '周二', value: 1180 },
    { name: '周三', value: 1150 },
    { name: '周四', value: 1200 },
    { name: '周五', value: 1190 },
    { name: '周六', value: 400 },
    { name: '周日', value: 350 },
  ];

  const lastUpdated = new Date().toLocaleDateString();

  return {
    stats,
    notices,
    quickActions,
    chartData,
    lastUpdated,
    isLoading,
  };
}
