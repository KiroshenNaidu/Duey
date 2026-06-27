'use client';

import { useContext } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { DebtCard } from '@/components/DebtCard';
import { AddDebtDialog } from '@/components/AddDebtDialog';
import { FixedPortal } from '@/components/FixedPortal';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DebtsList() {
  const { debts } = useContext(AppDataContext);
  const pathname = usePathname();

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

      {pathname === '/' && (
        <FixedPortal>
          <AddDebtDialog>
            <button
              aria-label="Add new debt"
              className="fixed left-1/2 -translate-x-1/2 h-12 w-12 bg-primary/80 backdrop-blur-sm rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 focus:outline-none transition-transform transform hover:scale-105 z-[60]"
              style={{ bottom: 'calc(10px + var(--sab))' }}
            >
              <Plus className="h-5 w-5" />
            </button>
          </AddDebtDialog>
        </FixedPortal>
      )}
    </div>
  );
}
