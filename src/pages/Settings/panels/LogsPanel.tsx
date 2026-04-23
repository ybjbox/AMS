import React from 'react';
import SystemLogs from '@/components/SystemLogs';

export default function LogsPanel() {
  return (
    <div className="h-full p-6 flex flex-col min-h-0">
      <SystemLogs />
    </div>
  );
}
