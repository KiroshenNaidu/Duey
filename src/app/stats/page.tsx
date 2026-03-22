'use client';

import { useContext, useMemo, useState, useEffect, Suspense } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, cn } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { Skeleton } from '@/components/ui/skeleton';
import { HistoryLog } from '@/components/HistoryLog';
import { TransportStatusCard } from '@/components/TransportStatusCard';
import { calculateGlobalStats } from '@/lib/calculations';

function StatsOverview() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  const overviewItems = [
    { 
      title: 'Total Debt', 
      value: stats.globalTotalDebt,
      colorClass: 'text-foreground'
    },
    { 
      title: 'Amount Paid', 
      value: stats.globalAmountPaid,
      colorClass: 'text-green-500'
    },
    { 
      title: 'Transport Paid', 
      value: stats.totalTransportPaid,
      colorClass: 'text-foreground'
    },
    { 
      title: 'Remaining', 
      value: stats.globalRemainingBalance,
      colorClass: 'text-red-500'
    },
  ];

  if (!isClient) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-2">
              <Skeleton className="h-3 w-3/4 mb-1" />
              <Skeleton className="h-5 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {overviewItems.map(item => (
        <Card key={item.title}>
          <CardContent className="p-2 flex flex-col justify-center">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">{item.title}</p>
            <p className={cn("text-sm font-bold truncate", item.colorClass)}>
              {formatCurrency(item.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsContent() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="container mx-auto max-w-md space-y-4 pt-11">
      <h1 className="text-xl font-bold text-foreground mb-1 text-center">Statistics</h1>
      
      <section>
        <h2 className="text-xs font-semibold mb-2 text-foreground uppercase tracking-widest">Overview</h2>
        <StatsOverview />
      </section>
      
      {isClient && (
        <section>
            <h2 className="text-xs font-semibold mb-2 text-foreground uppercase tracking-widest">Monthly Transport</h2>
            <TransportStatusCard />
        </section>
      )}


      {isClient && debts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold mb-2 text-foreground uppercase tracking-widest">Debt Progress</h2>
          <Card>
            <CardContent className="p-3">
              <DebtProgressCharts />
            </CardContent>
          </Card>
        </section>
      )}

      {isClient && history.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold mb-2 text-foreground uppercase tracking-widest">Payment History</h2>
          <HistoryLog />
        </section>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto max-w-md pt-24 text-center">
        <Skeleton className="h-8 w-48 mx-auto mb-4" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    }>
      <StatsContent />
    </Suspense>
  );
}
