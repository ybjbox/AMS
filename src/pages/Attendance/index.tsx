import React from 'react';
import Filter from './components/Filter';
import Stats from './components/Stats';
import Table from './components/Table';
import { useAttendance } from './hooks/useAttendance';

export default function Attendance() {
  const attendanceData = useAttendance();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Stats {...attendanceData} />
      <Filter {...attendanceData} />
      <div className="bg-white dark:bg-zinc-800 shadow-sm rounded-3xl overflow-hidden min-h-[500px]">
        <Table {...attendanceData} />
      </div>
    </div>
  );
}
