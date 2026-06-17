'use client';

import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DebtsList } from '@/components/DebtsList';
import { BudgetPlanner } from '@/components/BudgetPlanner';
import { TimeCalculator } from '@/components/TimeCalculator';

const MoneyOverview = dynamic(() => import('@/components/MoneyOverview').then(m => ({ default: m.MoneyOverview })), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full" />,
});

export function MoneyPage() {
  return (
    <div className="container mx-auto max-w-md pt-11">
      <h1 className="text-lg font-bold mb-3 text-foreground text-center">Manage Money</h1>

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
    </div>
  );
}
