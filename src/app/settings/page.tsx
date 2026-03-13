'use client';

import { BackupAndRestore } from '@/components/BackupAndRestore';
import { HistoryLog } from '@/components/HistoryLog';

export default function SettingsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Data Management</h2>
        <BackupAndRestore />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Payment History</h2>
        <HistoryLog />
      </section>
    </div>
  );
}
