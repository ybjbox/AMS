import React from 'react';
import { useDashboard } from './hooks/useDashboard';
import StatCards from './components/StatCards';
import SystemNotices from './components/SystemNotices';
import QuickActions from './components/QuickActions';

export default function Dashboard() {
  const dashboardData = useDashboard();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">控制台</h1>
        <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-800 px-4 py-2 rounded-full shadow-sm">
          最后更新时间: {dashboardData.lastUpdated}
        </div>
      </div>

      <StatCards stats={dashboardData.stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <SystemNotices notices={dashboardData.notices} />
        <QuickActions quickActions={dashboardData.quickActions} />
      </div>
    </div>
  );
}
