'use client';
import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { format } from 'date-fns';
import { Car } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';
import { calculateTransportMonth } from '@/lib/calculations';

export function TransportStatusCard() {
  const { transportSettings, transportOverrides, transportMonthlyOverrides, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);
  const currentDate = new Date();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const currentMonthStats = useMemo(() => {
    if (!isClient) return { totalDue: 0, isPaid: false };

    // Honour the live per-month flat-fee override so this card agrees with Balance/Transport.
    const monthKey = format(currentDate, 'yyyy-MM');
    const { totalDue } = calculateTransportMonth(
      currentDate, transportOverrides, transportSettings, currentDate, transportMonthlyOverrides[monthKey],
    );

    const currentMonthStr = format(currentDate, 'MMMM yyyy');
    const paymentForThisMonth = history.find(entry =>
      entry.type === 'transport' && entry.debtTitle === `Transport: ${currentMonthStr}`
    );

    const isPaid = !!paymentForThisMonth;

    return { totalDue, isPaid };
  }, [currentDate, transportOverrides, transportSettings, transportMonthlyOverrides, history, isClient]);

  // Same card shell as the other Stats cards: bg-card rounded-2xl p-4, left category-colour
  // icon + uppercase muted title, and a muted label / bold coloured value row.
  if (!isClient) {
    return (
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Car className="h-4 w-4 text-[hsl(var(--cat-transport))]" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    );
  }

  const isPaid = currentMonthStats.isPaid;
  const statusText = isPaid ? 'Paid' : 'Pending';

  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Car className="h-4 w-4 text-[hsl(var(--cat-transport))]" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monthly Transport</p>
        <span
          className={cn(
            'ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full',
            isPaid
              ? 'bg-[hsl(var(--positive))]/15 text-[hsl(var(--positive))]'
              : 'bg-[hsl(var(--negative))]/15 text-[hsl(var(--negative))]',
          )}
        >
          {statusText}
        </span>
      </div>
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-muted-foreground">{format(currentDate, 'MMMM yyyy')}</p>
        <p className="text-base font-bold text-[hsl(var(--cat-transport))] tabular-nums">
          {formatCurrency(currentMonthStats.totalDue)}
        </p>
      </div>
    </div>
  );
}
