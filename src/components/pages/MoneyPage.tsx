'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DebtsSection } from '@/components/DebtsSection';
import { BudgetPlanner } from '@/components/BudgetPlanner';
import { TimeCalculator } from '@/components/TimeCalculator';
import { CashflowSection } from '@/components/CashflowSection';

// Stats is the heaviest tab and only needed once you open it, so it is code-split (and
// warmed in the background — see prefetch.ts tier 1).
const StatsTab = dynamic(() => import('@/components/stats/StatsTab').then(m => ({ default: m.StatsTab })), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full" />,
});

const TAB_LABELS: Record<string, { label: string; description: string }> = {
  debts:    { label: 'Debts',    description: 'What you owe, and what you are owed' },
  budget:   { label: 'Budget',   description: 'Plan your monthly spending' },
  tools:    { label: 'Tools',    description: 'Calculators & converters' },
  expenses: { label: 'Cashflow', description: 'Money in and out this month' },
  stats:    { label: 'Stats',    description: 'Where your money went' },
};

export function MoneyPage() {
  const [activeTab, setActiveTab] = useState('debts');
  const current = TAB_LABELS[activeTab];

  return (
    <div className="container mx-auto max-w-md pt-11">
      <div className="text-center mb-3">
        <h1 className="text-lg font-bold text-foreground">Manage Money</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{current.description}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-tour="money-tabs" className="tabs-fluid w-full mb-3">
          <TabsTrigger value="tools" className="flex-auto">Tools</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-auto">Cashflow</TabsTrigger>
          <TabsTrigger value="debts" className="flex-auto">Debts</TabsTrigger>
          <TabsTrigger value="budget" className="flex-auto">Budget</TabsTrigger>
          <TabsTrigger value="stats" className="flex-auto">Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="debts">
          <DebtsSection />
        </TabsContent>
        <TabsContent value="budget">
          <BudgetPlanner />
        </TabsContent>
        <TabsContent value="tools">
          <TimeCalculator />
        </TabsContent>
        <TabsContent value="expenses">
          <CashflowSection />
        </TabsContent>
        <TabsContent value="stats">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
