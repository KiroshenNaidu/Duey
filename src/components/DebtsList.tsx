'use client';

import { useContext } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { DebtCard } from '@/components/DebtCard';
import { AddDebtDialog } from '@/components/AddDebtDialog';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DebtsList() {
  const { debts } = useContext(AppDataContext);

  return (
    <div className="space-y-3">
      {debts.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-base">Stop acting like you didn&apos;t forget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No debts tracked yet.</p>
            <p className="text-xs text-muted-foreground">Tap the + button to add one.</p>
          </CardContent>
        </Card>
      ) : (
        debts.map((debt) => <DebtCard key={debt.id} debt={debt} />)
      )}

      <AddDebtDialog>
        <button
          aria-label="Add new debt"
          className="fixed bottom-[50px] left-1/2 -translate-x-1/2 h-12 w-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 focus:outline-none transition-transform transform hover:scale-105 z-[60]"
        >
          <Plus className="h-6 w-6" />
        </button>
      </AddDebtDialog>
    </div>
  );
}
