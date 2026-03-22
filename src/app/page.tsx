'use client';

import { useContext, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { DebtCard } from '@/components/DebtCard';
import { AddDebtDialog } from '@/components/AddDebtDialog';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const { debts } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    /* Added pt-10 to push it down to match the other pages */
    <div className="container mx-auto max-w-md pt-10">
      
      {/* 
         Header section updated to match the height 
         of the Transport/Stats headers 
      */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">Duey</h1>
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mt-1">
          Debt Overview
        </p>
      </div>

      {!isClient ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : debts.length === 0 ? (
        <Card className="text-center border-accent/10">
          <CardHeader>
            <CardTitle className='text-base'>Stop acting like you didn't forget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">You haven't added any debts yet.</p>
            <p className="text-xs text-muted-foreground">Click the '+' button to get started.</p>
          </CardContent>
        </Card>
      ) : (
        /* Added a gap at the bottom of the list */
        <div className="flex flex-col gap-4">
          {debts.map((debt) => (
            <DebtCard key={debt.id} debt={debt} />
          ))}
        </div>
      )}

      <AddDebtDialog>
        <button
          aria-label="Add new debt"
          className="fixed bottom-[55px] left-1/2 -translate-x-1/2 h-12 w-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 focus:outline-none transition-all active:scale-95 z-[60]"
        >
          <Plus className="h-6 w-6" />
        </button>
      </AddDebtDialog>
    </div>
  );
}