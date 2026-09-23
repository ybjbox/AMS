import PageContainer from "@/components/PageContainer";
import React from 'react';
import Filter from './components/Filter';
import Stats from './components/Stats';
import Table from './components/Table';
import MonthlyReport from './components/MonthlyReport';
import ShiftRules from './components/ShiftRules';
import { useAttendance } from './hooks/useAttendance';

export default function Attendance() {
  const attendanceData = useAttendance();

  return (
    <PageContainer width="none">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">考勤管理</h1>
            <p className="page-subtitle">导入打卡记录，按部门工作时段自动对班并分析考勤异常</p>
          </div>
          {/* Tab 切换 */}
          <div className="tab-group" role="tablist" aria-label="考勤管理">
            {(
              [
                { tab: 'records', label: '打卡记录' },
                { tab: 'schedules', label: '排班字典' },
                { tab: 'shifts', label: '班次管理' },
                { tab: 'shift-rules', label: '部门时段' },
                { tab: 'anomalies', label: '异常分析' },
                { tab: 'monthly', label: '月度报表' },
              ] as const
            ).map(({ tab, label }) => (
              <button
                key={tab}
                role="tab"
                aria-selected={attendanceData.activeTab === tab}
                onClick={() => attendanceData.setActiveTab(tab)}
                className={attendanceData.activeTab === tab ? 'tab-item-active' : 'tab-item'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {attendanceData.activeTab !== 'monthly' && attendanceData.activeTab !== 'shift-rules' && (
          <div className="shrink-0 space-y-4 mb-4">
            <Stats {...attendanceData} />
            <Filter {...attendanceData} />
          </div>
        )}
        <div className="flex-1 card-base overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto" tabIndex={0} role="region" aria-label="考勤数据表">
            {attendanceData.activeTab === 'monthly' ? (
              <MonthlyReport />
            ) : attendanceData.activeTab === 'shift-rules' ? (
              <ShiftRules />
            ) : (
              <Table {...attendanceData} />
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
