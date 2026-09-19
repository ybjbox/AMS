import { useState, useEffect, useMemo } from 'react';
import { Users, Briefcase, FileText, Activity, Building2, Settings, LucideIcon } from 'lucide-react';
import { ChartData } from '../components/DashboardChart';
import { fetchUsersPage } from '@/services/userApi';
import { attendanceApi } from '@/services/attendanceApi';
import { notificationApi } from '@/services/notificationApi';
import { announcementApi, type Announcement } from '@/services/announcementApi';
import { fetchWorkforceStats, fetchAttendanceStats, type WorkforceStats, type AttendanceStats } from '@/services/statsApi';
import { flattenDepartments, useDepartments } from '@/store/useDepartmentStore';
import { useTodoStore } from '@/store/useTodoStore';
import { formatDateTime } from '@/utils/dateUtils';

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
  /** 公告/通知的真实 id——同标题同日期是常态（如多个员工的合同到期提醒），列表 key 必须用它 */
  id: string;
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
  workforce: WorkforceStats | null;
  attendance: AttendanceStats | null;
  lastUpdated: string;
  isLoading: boolean;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    name: '添加员工',
    href: '/users',
    icon: Users,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-900/30',
  },
  {
    name: '待办事项',
    href: '/todos',
    icon: FileText,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-900/30',
  },
  {
    name: '部门调整',
    href: '/departments',
    icon: Building2,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-900/30',
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
  const [raw, setRaw] = useState<{
    totalEmployees: number;
    todayPunchers: number;
    notices: NoticeItem[];
    chartData: ChartData[];
    lastUpdated: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workforce, setWorkforce] = useState<WorkforceStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null);

  // 部门数据复用全局 store（避免绕过 store 直连 http 导致的重复请求）
  const departments = useDepartments((state) => state.departments);
  const fetchDepartments = useDepartments((state) => state.fetchDepartments);
  // 待办未完成数复用全局 store（useInitData 已全局拉取，无需再直连 API）
  const pendingTodos = useTodoStore((state) => state.todos.filter((t) => !t.completed).length);

  useEffect(() => {
    // 确保组织架构已加载（store 内有 initialized/inflight 去重）
    fetchDepartments();
  }, [fetchDepartments]);

  // 人员流动 + 考勤看板统计（独立加载，失败不阻断仪表盘）
  useEffect(() => {
    let cancelled = false;
    fetchWorkforceStats()
      .then((w) => {
        if (!cancelled) setWorkforce(w);
      })
      .catch(() => {
        /* 统计不可用时该区块静默隐藏 */
      });
    fetchAttendanceStats()
      .then((a) => {
        if (!cancelled) setAttendance(a);
      })
      .catch(() => {
        /* 同上 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 数据拉取仅执行一次（不依赖 store 派生值，避免重复请求）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [usersPage, records, notifications, announcements] = await Promise.all([
          fetchUsersPage({ page: 1, pageSize: 1 }),
          attendanceApi.fetchRecords(),
          notificationApi.list(),
          // 公告为全员可读接口；失败时回退到最近通知（不阻断仪表盘）
          announcementApi.list(3).catch(() => [] as Announcement[]),
        ]);
        if (cancelled) return;

        // 今日打卡人数（原始值，department/todo 计数在 render 时派生）
        const today = new Date().toISOString().slice(0, 10);
        const todayPunchers = new Set(
          records.filter((r) => r.date === today).map((r) => r.employeeId)
        ).size;

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

        setRaw({
          totalEmployees: usersPage.total,
          todayPunchers,
          notices:
            announcements.length > 0
              ? announcements.map((a) => ({
                  id: a.id,
                  title: a.title,
                  dept: `${a.publisher || '管理员'}${a.priority === 'important' ? ' · 重要' : ''}`,
                  date: (a.createdAt || '').slice(0, 10),
                  isNew: Date.now() - new Date(a.createdAt).getTime() < 3 * 24 * 3600 * 1000,
                }))
              : notifications.slice(0, 3).map((n) => ({
                  id: n.id,
                  title: n.title,
                  dept: '系统通知',
                  date: (n.time || '').slice(0, 10),
                  isNew: !n.read,
                })),
          chartData: trend,
          lastUpdated: formatDateTime(new Date()),
        });
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

  // 统计卡片：从原始数据 + store 派生值组合（render 期派生，不触发副作用）
  const stats = useMemo<StatItem[]>(() => {
    const deptCount = flattenDepartments(departments).length;
    return [
      { name: '总员工数', value: String(raw?.totalEmployees ?? 0), change: '—', trend: 'neutral', icon: Users, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-900/30' },
      { name: '今日打卡', value: String(raw?.todayPunchers ?? 0), change: '—', trend: 'neutral', icon: Activity, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-900/30' },
      { name: '待办事项', value: String(pendingTodos), change: '—', trend: 'neutral', icon: FileText, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
      { name: '部门数量', value: String(deptCount), change: '—', trend: 'neutral', icon: Briefcase, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-900/30' },
    ];
  }, [raw, departments, pendingTodos]);

  return {
    stats,
    notices: raw?.notices ?? [],
    quickActions: QUICK_ACTIONS,
    chartData: raw?.chartData ?? [],
    workforce,
    attendance,
    lastUpdated: raw?.lastUpdated ?? '',
    isLoading,
  };
}
