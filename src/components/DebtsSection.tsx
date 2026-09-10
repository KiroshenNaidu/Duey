'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DebtsList } from '@/components/DebtsList';
import { LoansList } from '@/components/LoansList';

/**
 * Money → Debts, both directions. "Payable" is the original debts list; "Receivable" is the
 * lending ledger (LoansList) — money you handed to someone, and what has come back.
 *
 * They are two lists rather than one with a sign because they are two different things: a
 * debt is a monthly commitment Balance budgets around, a loan out is a record of a favour.
 * Only the open tab is mounted (Radix unmounts the other), which is also what hands the
 * page's + FAB to whichever list is showing — each portals its own.
 */
export function DebtsSection() {
  const [side, setSide] = useState('owed');

  return (
    <Tabs value={side} onValueChange={setSide}>
      <TabsList className="tabs-fluid w-full">
        <TabsTrigger value="owed" className="flex-auto">Outgoing</TabsTrigger>
        <TabsTrigger value="lent" className="flex-auto">Incoming</TabsTrigger>
      </TabsList>

      <TabsContent value="owed">
        <DebtsList />
      </TabsContent>

      <TabsContent value="lent">
        <LoansList />
      </TabsContent>
    </Tabs>
  );
}
