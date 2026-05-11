import React from 'react';
import { useDashboard } from './hooks/useDashboard';
import StatCards from './components/StatCards';
import SystemNotices from './components/SystemNotices';
import QuickActions from './components/QuickActions';
import DashboardChart from './components/DashboardChart';

export default function Dashboard() {
  const dashboardData = useDashboard();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500 w-full min-h-full max-w-7xl mx-auto">
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
        {/* 图表：平板占 3/5，桌面占 3/5 */}
        <div className="md:col-span-3">
          <DashboardChart data={dashboardData.chartData} isLoading={dashboardData.isLoading} />
        </div>
        {/* 快捷操作 + 公告：平板占 2/5，桌面占 2/5 */}
        <div className="md:col-span-2 space-y-6 md:space-y-8">
          <QuickActions quickActions={dashboardData.quickActions} isLoading={dashboardData.isLoading} />
          <SystemNotices notices={dashboardData.notices} isLoading={dashboardData.isLoading} />
        </div>
      </div>
    </div>
  );
}
