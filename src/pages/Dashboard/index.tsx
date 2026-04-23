import React from 'react';
import { useDashboard } from './hooks/useDashboard';
import StatCards from './components/StatCards';
import SystemNotices from './components/SystemNotices';
import QuickActions from './components/QuickActions';
import DashboardChart from './components/DashboardChart';

export default function Dashboard() {
  const dashboardData = useDashboard();

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="page-header px-2">
        <div>
          <h1 className="page-title">控制台</h1>
          <p className="page-subtitle">系统运行总览与快捷入口</p>
        </div>
        <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-800 px-4 py-2 rounded-full shadow-sm border border-zinc-100 dark:border-zinc-700/50">
          最后更新时间: {dashboardData.lastUpdated}
        </div>
      </div>

      <StatCards stats={dashboardData.stats} isLoading={dashboardData.isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <DashboardChart data={dashboardData.chartData} isLoading={dashboardData.isLoading} />
        <div className="space-y-6 md:space-y-8">
          <QuickActions quickActions={dashboardData.quickActions} isLoading={dashboardData.isLoading} />
          <SystemNotices notices={dashboardData.notices} isLoading={dashboardData.isLoading} />
        </div>
      </div>
    </div>
  );
}
