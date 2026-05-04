import React from 'react';
import Filter from './components/Filter';
import Stats from './components/Stats';
import Table from './components/Table';
import { useAttendance } from './hooks/useAttendance';

export default function Attendance() {
  const attendanceData = useAttendance();

  return (
    <div className="w-full flex flex-col p-4 sm:p-6 lg:p-8 min-h-full">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">考勤管理</h1>
            <p className="page-subtitle">导入打卡记录与排班字典，自动分析考勤异常</p>
          </div>
          {/* Tab 切换 */}
          <div className="tab-group">
            {(
              [
                { tab: 'records', label: '打卡记录' },
                { tab: 'schedules', label: '排班字典' },
                { tab: 'shifts', label: '班次管理' },
                { tab: 'anomalies', label: '异常分析' },
              ] as const
            ).map(({ tab, label }) => (
              <button
                key={tab}
                onClick={() => attendanceData.setActiveTab(tab)}
                className={attendanceData.activeTab === tab ? 'tab-item-active' : 'tab-item'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="shrink-0 space-y-4 mb-4">
          <Stats {...attendanceData} />
          <Filter {...attendanceData} />
        </div>
        <div className="flex-1 card-base overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            <Table {...attendanceData} />
          </div>
        </div>
      </div>
    </div>
  );
}
