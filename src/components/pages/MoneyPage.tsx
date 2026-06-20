'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DebtsList } from '@/components/DebtsList';
import { BudgetPlanner } from '@/components/BudgetPlanner';
import { TimeCalculator } from '@/components/TimeCalculator';
import { ExpensesList } from '@/components/ExpensesList';

const MoneyOverview = dynamic(() => import('@/components/MoneyOverview').then(m => ({ default: m.MoneyOverview })), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full" />,
});

const TAB_LABELS: Record<string, { label: string; description: string }> = {
  debts:    { label: 'Debts',    description: 'Track what you owe' },
  budget:   { label: 'Budget',   description: 'Plan your monthly spending' },
  tools:    { label: 'Tools',    description: 'Calculators & converters' },
  expenses: { label: 'Expenses', description: 'Log your spending' },
  balance:  { label: 'Balance',  description: 'Money overview' },
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
        <TabsList className="w-full mb-3">
          <TabsTrigger value="debts" className="flex-1">Debts</TabsTrigger>
          <TabsTrigger value="budget" className="flex-1">Budget</TabsTrigger>
          <TabsTrigger value="tools" className="flex-1">Tools</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1">Expenses</TabsTrigger>
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
        <TabsContent value="expenses">
          <ExpensesList />
        </TabsContent>
        <TabsContent value="balance">
          <MoneyOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
