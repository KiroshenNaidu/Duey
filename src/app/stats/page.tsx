'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  if (!isClient) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Debt</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Amount Paid</CardTitle>
          </CardHeader>
          <CardContent>
             <Skeleton className="h-8 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
             <Skeleton className="h-8 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Debt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(stats.globalTotalDebt)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Amount Paid</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(stats.globalAmountPaid)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(stats.globalRemainingBalance)}</p>
        </CardContent>
      </Card>
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
      <h1 className="text-3xl font-bold text-foreground">Statistics</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Total Overview</h2>
        <StatsOverview />
      </section>

      {isClient && debts.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Debt Progress</h2>
          <Card>
            <CardContent className="pt-6">
              <DebtProgressCharts />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
