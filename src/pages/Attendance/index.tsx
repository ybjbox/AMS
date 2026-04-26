import React from 'react';
import Filter from './components/Filter';
import Stats from './components/Stats';
import Table from './components/Table';
import { useAttendance } from './hooks/useAttendance';

export default function Attendance() {
  const attendanceData = useAttendance();

  return (
    <div className="absolute inset-0 w-full flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">考勤管理</h1>
            <p className="page-subtitle">导入打卡记录与排班字典，自动分析考勤异常</p>
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
