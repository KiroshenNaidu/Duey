'use client';

import { BackupAndRestore } from '@/components/BackupAndRestore';
import { HistoryLog } from '@/components/HistoryLog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  return (
    <div className="container mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold text-foreground mb-4">Settings</h1>
      
       <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <HistoryLog />
        </TabsContent>
        <TabsContent value="data">
           <BackupAndRestore />
        </TabsContent>
      </Tabs>
    </div>
  );
}
