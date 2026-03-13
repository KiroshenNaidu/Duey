'use client';
import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Car } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';
import { calculateTransportMonth } from '@/lib/calculations';

export function TransportStatusCard() {
  const { transportSettings, transportOverrides, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);
  const [currentDate] = useState(new Date());

  useEffect(() => {
    setIsClient(true);
  }, []);

  const currentMonthStats = useMemo(() => {
    if (!isClient) return { totalDue: 0, isPaid: false };
    
    const { totalDue } = calculateTransportMonth(currentDate, transportOverrides, transportSettings.dailyFee);

    const currentMonthStr = format(currentDate, 'MMMM yyyy');
    const paymentForThisMonth = history.find(entry => 
      entry.type === 'transport' && entry.debtTitle === `Transport: ${currentMonthStr}`
    );
    
    const isPaid = !!paymentForThisMonth;

    return { totalDue, isPaid };
  }, [currentDate, transportOverrides, transportSettings.dailyFee, history, isClient]);

  if (!isClient) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-2/4" />
                <Car className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-8 w-3/4 mb-1" />
                <Skeleton className="h-3 w-1/4" />
            </CardContent>
        </Card>
    )
  }
  
  const statusText = currentMonthStats.isPaid ? 'Paid' : 'Pending';
  const statusColor = currentMonthStats.isPaid ? 'text-green-500' : 'text-red-500';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Monthly Transport</CardTitle>
        <Car className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatCurrency(currentMonthStats.totalDue)}</div>
        <p className={cn('text-xs font-semibold', statusColor)}>
          Status: {statusText} for {format(currentDate, 'MMMM')}
        </p>
      </CardContent>
    </Card>
  );
}
