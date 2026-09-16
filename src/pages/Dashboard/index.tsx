import PageContainer from "@/components/PageContainer";
import React, { lazy, Suspense } from 'react';
import { useDashboard } from './hooks/useDashboard';
import StatCards from './components/StatCards';
import SystemNotices from './components/SystemNotices';
import QuickActions from './components/QuickActions';

// recharts 体积较大（~350KB）：懒加载使图表代码仅在控制台页进入时加载，
// 不拖累登录页与其它页面的首屏
const DashboardChart = lazy(() => import('./components/DashboardChart'));
import WorkforceTrend from './components/WorkforceTrend';
import DepartmentDistribution from './components/DepartmentDistribution';

export default function Dashboard() {
  const dashboardData = useDashboard();

  return (
    <PageContainer className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <div>
          <h1 className="page-title">控制台</h1>
          <p className="page-subtitle">系统运行总览与快捷入口</p>
        </div>
        <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-800 px-4 py-2 rounded-full shadow-sm border border-zinc-100 dark:border-zinc-700/50">
          最后更新时间: {dashboardData.lastUpdated}
        </div>
      </div>

      <StatCards stats={dashboardData.stats} isLoading={dashboardData.isLoading} />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-8">
        {/* 图表：平板占 3/5，桌面占 3/5（recharts 懒加载） */}
        <div className="md:col-span-3">
          <Suspense fallback={<div className="card-base p-6 min-h-[300px] flex items-center justify-center text-sm text-zinc-500">图表加载中…</div>}>
            <DashboardChart data={dashboardData.chartData} isLoading={dashboardData.isLoading} />
          </Suspense>
        </div>
        {/* 快捷操作 + 公告：平板占 2/5，桌面占 2/5 */}
        <div className="md:col-span-2 space-y-6 md:space-y-8">
          <QuickActions quickActions={dashboardData.quickActions} isLoading={dashboardData.isLoading} />
          <SystemNotices notices={dashboardData.notices} isLoading={dashboardData.isLoading} />
        </div>
      </div>

      {/* 第二行：人员流动趋势 + 部门分布（P1 统计） */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-3">
          <WorkforceTrend stats={dashboardData.workforce} isLoading={dashboardData.isLoading} />
        </div>
        <div className="md:col-span-2">
          <DepartmentDistribution stats={dashboardData.workforce} isLoading={dashboardData.isLoading} />
        </div>
      </div>
    </PageContainer>
  );
}
