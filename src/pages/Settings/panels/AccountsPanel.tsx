import React from 'react';
import AccountManager from '@/components/AccountManager';
import SettingsPanel from '../components/SettingsPanel';

export default function AccountsPanel() {
  return (
    <SettingsPanel scroll="none">
      <AccountManager />
    </SettingsPanel>
  );
}
