'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { Skeleton } from '@/components/ui/skeleton';
import { HistoryLog } from '@/components/HistoryLog';
import { TransportStatusCard } from '@/components/TransportStatusCard';

function StatsOverview() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const stats = useMemo(() => {
    const globalTotalDebt = debts.reduce((acc, debt) => acc + debt.total_owed, 0);
    const globalAmountPaid = debts.reduce(
      (acc, debt) => acc + debt.payment_score * debt.installment_amount,
      0
    );
    const globalRemainingBalance = globalTotalDebt - globalAmountPaid;
    const totalTransportPaid = history
      .filter((item) => item.type === 'transport')
      .reduce((acc, item) => acc + item.amount, 0);

    return { globalTotalDebt, globalAmountPaid, globalRemainingBalance, totalTransportPaid };
  }, [debts, history]);

  const overviewItems = [
    { title: 'Total Debt', value: stats.globalTotalDebt },
    { title: 'Amount Paid', value: stats.globalAmountPaid },
    { title: 'Transport Paid', value: stats.totalTransportPaid },
    { title: 'Remaining Debt', value: stats.globalRemainingBalance },
  ];

  if (!isClient) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {overviewItems.map(item => (
          <Card key={item.title}>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
              <Skeleton className="h-7 w-3/4 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {overviewItems.map(item => (
        <Card key={item.title}>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
            <p className="text-2xl font-bold">{formatCurrency(item.value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="container mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold text-foreground mb-4">Statistics</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-2">Total Overview</h2>
        <StatsOverview />
      </section>
      
      {isClient && (
        <section>
            <h2 className="text-xl font-semibold mb-2">This Month's Transport</h2>
            <TransportStatusCard />
        </section>
      )}


      {isClient && debts.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Debt Progress</h2>
          <Card>
            <CardContent className="p-2 sm:p-4">
              <DebtProgressCharts />
            </CardContent>
          </Card>
        </section>
      )}

      {isClient && history.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Payment History</h2>
          <HistoryLog />
        </section>
      )}
    </div>
  );
}
