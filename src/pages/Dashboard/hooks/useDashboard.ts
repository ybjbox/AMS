import { useState, useEffect } from 'react';
import { Users, Briefcase, FileText, Activity, Building2, Settings, LucideIcon } from 'lucide-react';
import { ChartData } from '../components/DashboardChart';
import { fetchUsersPage } from '@/services/userApi';
import { attendanceApi } from '@/services/attendanceApi';
import { todoApi } from '@/services/todoApi';
import { notificationApi } from '@/services/notificationApi';
import { http } from '@/services/api';
import { flattenDepartments } from '@/store/useDepartmentStore';
import { DepartmentNode } from '@/types';

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
  href: string;
}

export interface UseDashboardReturn {
  stats: StatItem[];
  notices: NoticeItem[];
  quickActions: QuickActionItem[];
  chartData: ChartData[];
  lastUpdated: string;
  isLoading: boolean;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    name: '添加员工',
    href: '/users',
    icon: Users,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
  },
  {
    name: '待办事项',
    href: '/todos',
    icon: FileText,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
  },
  {
    name: '部门调整',
    href: '/departments',
    icon: Building2,
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/30',
  },
  {
    name: '系统设置',
    href: '/settings',
    icon: Settings,
    color: 'text-zinc-600 dark:text-zinc-400',
    bg: 'bg-zinc-50 dark:bg-zinc-800',
  },
];

const WEEKDAY = '日一二三四五六';

export function useDashboard(): UseDashboardReturn {
  const [stats, setStats] = useState<StatItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [usersPage, records, todos, deptRes, notifications] = await Promise.all([
          fetchUsersPage({ page: 1, pageSize: 1 }),
          attendanceApi.fetchRecords(),
          todoApi.list(),
          http.get<{ departments: DepartmentNode[] }>('/departments'),
          notificationApi.list(),
        ]);
        if (cancelled) return;

        // 统计卡片：真实数据（员工总数 / 今日打卡人数 / 未完成待办 / 部门数）
        const today = new Date().toISOString().slice(0, 10);
        const todayPunchers = new Set(
          records.filter((r) => r.date === today).map((r) => r.employeeId)
        );
        const pendingTodos = todos.filter((t) => !t.completed).length;
        const deptCount = flattenDepartments(deptRes.departments ?? []).length;

        setStats([
          { name: '总员工数', value: String(usersPage.total), change: '—', trend: 'neutral', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
          { name: '今日打卡', value: String(todayPunchers.size), change: '—', trend: 'neutral', icon: Activity, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
          { name: '待办事项', value: String(pendingTodos), change: '—', trend: 'neutral', icon: FileText, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
          { name: '部门数量', value: String(deptCount), change: '—', trend: 'neutral', icon: Briefcase, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
        ]);

        // 近 7 天出勤趋势（按打卡日期聚合）
        const byDate = new Map<string, number>();
        for (const r of records) byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
        const trend: ChartData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          trend.push({ name: `周${WEEKDAY[d.getDay()]}`, value: byDate.get(key) ?? 0 });
        }
        setChartData(trend);

        // 公告栏：取最新几条系统通知
        setNotices(
          notifications.slice(0, 3).map((n) => ({
            title: n.title,
            dept: '系统通知',
            date: (n.time || '').slice(0, 10),
            isNew: !n.read,
          }))
        );

        setLastUpdated(
          new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      } catch {
        // 保持空态（加载失败时由全局错误提示兜底）
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    stats,
    notices,
    quickActions: QUICK_ACTIONS,
    chartData,
    lastUpdated,
    isLoading,
  };
}
