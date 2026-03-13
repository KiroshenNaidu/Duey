'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { Skeleton } from '@/components/ui/skeleton';

function StatsOverview() {
  const { debts } = useContext(AppDataContext);
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

    return { globalTotalDebt, globalAmountPaid, globalRemainingBalance };
  }, [debts]);

  const overviewItems = [
    { title: 'Total Debt', value: stats.globalTotalDebt },
    { title: 'Amount Paid', value: stats.globalAmountPaid },
    { title: 'Remaining', value: stats.globalRemainingBalance },
  ];

  if (!isClient) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
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
    <div className="grid gap-3 md:grid-cols-3">
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
  const { debts } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="container mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold text-foreground mb-4">Statistics</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-2">Total Overview</h2>
        <StatsOverview />
      </section>

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
    </div>
  );
}
