import { Users, Briefcase, FileText, Activity, Building2, Settings, LucideIcon } from 'lucide-react';

export interface StatItem {
  name: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  color: string;
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
  lastUpdated: string;
}

export function useDashboard(): UseDashboardReturn {
  const stats: StatItem[] = [
    { name: '总员工数', value: '1,240', change: '+12%', trend: 'up', icon: Users, color: 'bg-blue-600' },
    { name: '今日出勤', value: '1,180', change: '+2.1%', trend: 'up', icon: Activity, color: 'bg-emerald-500' },
    { name: '待办审批', value: '24', change: '-5', trend: 'down', icon: FileText, color: 'bg-amber-500' },
    { name: '部门数量', value: '12', change: '0', trend: 'neutral', icon: Briefcase, color: 'bg-indigo-500' },
  ];

  const notices: NoticeItem[] = [
    { title: '关于2026年端午节放假安排的通知', dept: '行政部', date: '2026-03-10', isNew: true },
    { title: '系统V2.0版本更新说明及功能介绍', dept: 'IT部', date: '2026-03-08', isNew: false },
    { title: '第一季度优秀员工表彰决定', dept: '人事部', date: '2026-03-01', isNew: false },
  ];

  const quickActions: QuickActionItem[] = [
    { name: '添加员工', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { name: '发起审批', icon: FileText, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { name: '部门调整', icon: Building2, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { name: '系统设置', icon: Settings, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800' },
  ];

  const lastUpdated = new Date().toLocaleDateString();

  return {
    stats,
    notices,
    quickActions,
    lastUpdated
  };
}
