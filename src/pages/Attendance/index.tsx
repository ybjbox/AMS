import React from 'react';
import Filter from './components/Filter';
import Stats from './components/Stats';
import Table from './components/Table';
import { useAttendance } from './hooks/useAttendance';

export default function Attendance() {
  const attendanceData = useAttendance();

  return (
    <div className="absolute inset-0 w-full flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
        <div className="shrink-0 space-y-4 mb-4">
          <Stats {...attendanceData} />
          <Filter {...attendanceData} />
        </div>
        <div className="flex-1 bg-white dark:bg-zinc-800 shadow-sm rounded-3xl overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            <Table {...attendanceData} />
          </div>
        </div>
      </div>
    </div>
  );
}
