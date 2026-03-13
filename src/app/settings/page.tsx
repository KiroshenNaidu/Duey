'use client';

import { BackupAndRestore } from '@/components/BackupAndRestore';
import { HistoryLog } from '@/components/HistoryLog';

export default function SettingsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold text-foreground mb-4">Settings</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-2">Data Management</h2>
        <BackupAndRestore />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Payment History</h2>
        <HistoryLog />
      </section>
    </div>
  );
}
