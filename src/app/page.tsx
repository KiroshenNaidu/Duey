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
    <div className="container mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold mb-4 text-foreground">TaxMaxxing</h1>

      {!isClient ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : debts.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className='text-lg'>Stop acting like you didnt forget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">You haven't added any debts yet.</p>
            <p className="text-sm text-muted-foreground">Click the '+' button to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {debts.map((debt) => (
            <DebtCard key={debt.id} debt={debt} />
          ))}
        </div>
      )}

      <AddDebtDialog>
        <button
          aria-label="Add new debt"
          className="fixed bottom-20 right-4 h-14 w-14 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-transform transform hover:scale-105"
        >
          <Plus className="h-7 w-7" />
        </button>
      </AddDebtDialog>
    </div>
  );
}
