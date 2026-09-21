import React from 'react';
import AccountManager from '@/components/AccountManager';

export default function AccountsPanel() {
  return (
    <div className="h-full p-6 flex flex-col min-h-0 overflow-y-auto">
      <AccountManager />
    </div>
  );
}
