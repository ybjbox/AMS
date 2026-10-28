import { useState, useEffect, useMemo } from 'react';
import { Users, Briefcase, FileText, Activity, Building2, Settings, LucideIcon } from 'lucide-react';
import { ChartData } from '../components/DashboardChart';
import { useUserStore } from '@/store/useUserStore';
import { attendanceApi } from '@/services/attendanceApi';
import { notificationApi } from '@/services/notificationApi';
import { announcementApi, type Announcement } from '@/services/announcementApi';
import { fetchWorkforceStats, fetchAttendanceStats, type WorkforceStats, type AttendanceStats } from '@/services/statsApi';
import { flattenDepartments, useDepartments } from '@/store/useDepartmentStore';
import { useTodoStore, todoUrgency } from '@/store/useTodoStore';
import { formatDate, formatDateTime } from '@/utils/dateUtils';

export interface StatItem {
  name: string;
  value: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  /** 口径说明：如数据截止日；不要用一个数字假装它是“今天” */
  hint?: string;
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
  /** 入口对应的能力码；缺省 = 全员可见。没有它就会出现「员工点了进 /403」的假入口 */
  permission?: string;
}

export interface UseDashboardReturn {
  stats: StatItem[];
  notices: NoticeItem[];
  quickActions: QuickActionItem[];
  chartData: ChartData[];
  workforce: WorkforceStats | null;
  attendance: AttendanceStats | null;
  /** 打卡数据的新鲜度：截止日 + 未覆盖天数 */
  coverage: { latestDate: string | null; uncoveredDays: number } | null;
  /** 本次取数完成的时刻（不是库里数据的新旧） */
  refreshedAt: string;
  isLoading: boolean;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    name: '添加员工',
    href: '/users',
    permission: 'users:manage',
    icon: Users,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-900/30',
  },
  {
    name: '待办事项',
    href: '/todos',
    permission: 'todos:view',
    icon: FileText,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-900/30',
  },
  {
    name: '部门调整',
    href: '/departments',
    permission: 'departments:manage',
    icon: Building2,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-900/30',
  },
  {
    name: '系统设置',
    href: '/settings',
    permission: 'settings:view',
    icon: Settings,
    color: 'text-zinc-600 dark:text-zinc-400',
    bg: 'bg-zinc-50 dark:bg-zinc-800',
  },
];

const WEEKDAY = '日一二三四五六';

function daysBetween(dateStr: string, to: Date): number {
  const from = new Date(`${dateStr}T00:00:00`);
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  if (Number.isNaN(from.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - from.getTime()) / 86400000));
}

/** 快捷入口按能力码过滤（导出以便单测钉住「不摆出点了必 403 的入口」这条规则） */
export function filterQuickActions(hasPermission: (code: string) => boolean): QuickActionItem[] {
  return QUICK_ACTIONS.filter((a) => !a.permission || hasPermission(a.permission));
}

export function useDashboard(): UseDashboardReturn {
  const [raw, setRaw] = useState<{
    todayPunchers: number;
    notices: NoticeItem[];
    chartData: ChartData[];
    /** 本次取数完成的时刻。它只说明"这屏数据多新"，不代表库里数据新旧 ——
     *  后者是考勤模块的「最新打卡日 · 距今 N 天」，别在这里冒充它。 */
    refreshedAt: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workforce, setWorkforce] = useState<WorkforceStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null);

  // 部门数据复用全局 store（避免绕过 store 直连 http 导致的重复请求）
  const departments = useDepartments((state) => state.departments);
  const fetchDepartments = useDepartments((state) => state.fetchDepartments);
  // 待办未完成数复用全局 store（useInitData 已全局拉取，无需再直连 API）
  const pendingTodos = useTodoStore((state) => todoUrgency(state.todos).pending);

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
        const [records, notifications, announcements] = await Promise.all([
          attendanceApi.fetchRecords(),
          notificationApi.list(),
          // 公告为全员可读接口；失败时回退到最近通知（不阻断仪表盘）
          announcementApi.list(3).catch(() => [] as Announcement[]),
        ]);
        if (cancelled) return;

        // 今日打卡人数（原始值，department/todo 计数在 render 时派生）
        const today = formatDate(new Date());
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
          const key = formatDate(d);
          trend.push({ name: `周${WEEKDAY[d.getDay()]}`, value: byDate.get(key) ?? 0 });
        }

        setRaw({
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
          refreshedAt: formatDateTime(new Date()),
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
  const coverage = useMemo(() => {
    if (!attendance) return null;
    const latestDate = attendance.lastPunchDate;
    return { latestDate, uncoveredDays: latestDate ? daysBetween(latestDate, new Date()) : 0 };
  }, [attendance]);

  const stats = useMemo<StatItem[]>(() => {
    const deptCount = flattenDepartments(departments).length;
    /**
     * 在册 = 在职 + 试用期，取自 `/stats/workforce`，与下方部门分布同一份数据 ——
     * 原先这里另发一次 `/users?page=1&pageSize=1` 取其 `total`（**含离职**），
     * 于是同屏挂着两个"员工数"且口径不同：卡片 28、部门分布 28 现在恰好相等，
     * 一旦有人被标离职就会当场打架。留一个数，并且它和部门分布加起来必然相等。
     */
    const active = workforce ? Object.values(workforce.statuses).reduce((s, n) => s + n, 0) : 0;
    return [
      { name: '在册员工', value: String(active), icon: Users, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-900/30' },
      {
        name: '今日打卡',
        value: String(raw?.todayPunchers ?? 0),
        icon: Activity,
        color: 'text-brand-600 dark:text-brand-400',
        bg: 'bg-brand-50 dark:bg-brand-900/30',
        hint: coverage
          ? coverage.latestDate
            ? `数据截止 ${coverage.latestDate}${coverage.uncoveredDays > 0 ? ` · 未覆盖 ${coverage.uncoveredDays} 天` : ''}`
            : '尚未导入打卡'
          : undefined,
      },
      { name: '待办事项', value: String(pendingTodos), icon: FileText, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
      { name: '部门数量', value: String(deptCount), icon: Briefcase, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-900/30' },
    ];
  }, [raw, departments, pendingTodos, workforce, coverage]);

  // 快捷入口与侧栏同一套能力码过滤：写死的常量会摆出「员工点了进 /403」的假入口
  const hasPermission = useUserStore((state) => state.hasPermission);
  const quickActions = useMemo(() => filterQuickActions(hasPermission), [hasPermission]);

  return {
    stats,
    notices: raw?.notices ?? [],
    quickActions,
    chartData: raw?.chartData ?? [],
    workforce,
    attendance,
    coverage,
    refreshedAt: raw?.refreshedAt ?? '',
    isLoading,
  };
}
