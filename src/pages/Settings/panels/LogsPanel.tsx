import React from 'react';
import SystemLogs from '@/components/SystemLogs';
import SettingsPanel from '../components/SettingsPanel';

export default function LogsPanel() {
  return (
    <SettingsPanel scroll="none">
      <SystemLogs />
    </SettingsPanel>
  );
}
