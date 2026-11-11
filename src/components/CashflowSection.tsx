'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpensesList } from '@/components/ExpensesList';
import { IncomeList } from '@/components/IncomeList';

/**
 * Money → Cashflow, both directions — the same Outgoing/Incoming split as DebtsSection.
 * Outgoing is the expenses list; Incoming is extra income (the same entries the Balance
 * card counts). Only the open tab is mounted, which hands the page's + FAB to whichever
 * list is showing — each portals its own.
 */
export function CashflowSection() {
  const [side, setSide] = useState('out');

  return (
    <Tabs value={side} onValueChange={setSide}>
      <TabsList className="tabs-fluid w-full">
        <TabsTrigger value="out" className="flex-auto">Outgoing</TabsTrigger>
        <TabsTrigger value="in" className="flex-auto">Incoming</TabsTrigger>
      </TabsList>

      <TabsContent value="out">
        <ExpensesList />
      </TabsContent>

      <TabsContent value="in">
        <IncomeList />
      </TabsContent>
    </Tabs>
  );
}
