'use client';
import { useContext, useMemo, useState, useEffect } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import { AppDataContext } from '@/context/AppDataContext';
import { format, getDaysInMonth, startOfMonth, isWeekend, add } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Car } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';

type TransportSettings = {
  driverName: string;
  dailyFee: number;
};

type TransportOverrides = {
  [key: string]: boolean; // ISODateString: isTravelDay
};

export function TransportStatusCard() {
  const [settings] = useLocalStorage<TransportSettings>('transportSettings', { driverName: '', dailyFee: 0 });
  const [overrides] = useLocalStorage<TransportOverrides>('transportOverrides', {});
  const { history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);
  const [currentDate] = useState(new Date());

  useEffect(() => {
    setIsClient(true);
  }, []);

  const currentMonthStats = useMemo(() => {
    if (!isClient) return { totalDue: 0, isPaid: false };
    
    const monthStart = startOfMonth(currentDate);
    const daysInMonth = Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => add(monthStart, { days: i }));

    let travelDaysCount = 0;
    daysInMonth.forEach(day => {
      const isoDate = day.toISOString().split('T')[0];
      const isOverridden = overrides[isoDate] !== undefined;
      const isTravelDay = isOverridden ? overrides[isoDate] : !isWeekend(day);
      if (isTravelDay) {
        travelDaysCount++;
      }
    });

    const totalDue = travelDaysCount * (settings.dailyFee || 0);

    const currentMonthStr = format(currentDate, 'MMMM yyyy');
    const paymentForThisMonth = history.find(entry => 
      entry.type === 'transport' && entry.debtTitle === `Transport: ${currentMonthStr}`
    );
    
    const isPaid = !!paymentForThisMonth;

    return { totalDue, isPaid };
  }, [currentDate, overrides, settings.dailyFee, history, isClient]);

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
