'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DebtsList } from '@/components/DebtsList';
import { BudgetPlanner } from '@/components/BudgetPlanner';
import { TimeCalculator } from '@/components/TimeCalculator';
import { MoneyOverview } from '@/components/MoneyOverview';

export default function Home() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  return (
    <div className="container mx-auto max-w-md pt-11">
      <h1 className="text-lg font-bold mb-3 text-foreground text-center">Manage Money</h1>

      {!isClient ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="debts">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="debts" className="flex-1">Debts</TabsTrigger>
            <TabsTrigger value="budget" className="flex-1">Budget</TabsTrigger>
            <TabsTrigger value="tools" className="flex-1">Tools</TabsTrigger>
            <TabsTrigger value="balance" className="flex-1">Balance</TabsTrigger>
          </TabsList>
          <TabsContent value="debts">
            <DebtsList />
          </TabsContent>
          <TabsContent value="budget">
            <BudgetPlanner />
          </TabsContent>
          <TabsContent value="tools">
            <TimeCalculator />
          </TabsContent>
          <TabsContent value="balance">
            <MoneyOverview />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
