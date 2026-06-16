'use client';

import { useMemo, useState } from 'react';
import { format, startOfMonth, sub, getDaysInMonth, add } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, cn } from '@/lib/utils';
import { getDayState } from '@/lib/calculations';
import type { HistoryEntry, UberRide, TransportOverrides, TransportSettings } from '@/lib/types';

interface TransportHistoryLogProps {
  history: HistoryEntry[];
  uberRides: UberRide[];
  transportOverrides: TransportOverrides;
  transportSettings: TransportSettings;
}

function getMonthDayCounts(date: Date, overrides: TransportOverrides) {
  const monthStart = startOfMonth(date);
  const days = Array.from({ length: getDaysInMonth(date) }, (_, i) => add(monthStart, { days: i }));
  let full = 0;
  let half = 0;
  days.forEach(day => {
    const state = getDayState(day, overrides);
    if (state === 1) full++;
    else if (state === 1.5) half++;
  });
  return { full, half };
}

function MonthBar({ value, max, color = 'bg-primary/70' }: { value: number; max: number; color?: string }) {
  return (
    <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: max > 0 ? `${Math.max(2, (value / max) * 100)}%` : '0%' }}
      />
    </div>
  );
}

function Section({ title, totalLabel, totalValue, children, defaultOpen = true }: {
  title: string;
  totalLabel: string;
  totalValue: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
          <span className="text-[10px] font-bold text-foreground">{formatCurrency(totalValue)}</span>
          <span className="text-[9px] text-muted-foreground">{totalLabel}</span>
        </div>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-2 pl-0">{children}</div>}
    </div>
  );
}

export function TransportHistoryLog({ history, uberRides, transportOverrides }: TransportHistoryLogProps) {
  const months = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 6 }, (_, i) => sub(startOfMonth(today), { months: i }));
  }, []);

  const driverMonths = useMemo(() => months.map(monthDate => {
    const monthStr = format(monthDate, 'MMMM yyyy');
    const entry = history.find(h => h.type === 'transport' && h.debtTitle === `Transport: ${monthStr}`);
    const amount = entry?.amount ?? 0;
    const { full, half } = getMonthDayCounts(monthDate, transportOverrides);
    return { monthDate, amount, full, half };
  }), [months, history, transportOverrides]);

  const uberMonths = useMemo(() => months.map(monthDate => {
    const prefix = format(monthDate, 'yyyy-MM');
    const rides = uberRides.filter(r => r.date.startsWith(prefix));
    const amount = rides.reduce((s, r) => s + r.price, 0);
    return { monthDate, amount, rideCount: rides.length };
  }), [months, uberRides]);

  const totalDriver = driverMonths.reduce((s, m) => s + m.amount, 0);
  const totalUber = uberMonths.reduce((s, m) => s + m.amount, 0);
  const maxDriver = Math.max(...driverMonths.map(m => m.amount), 1);
  const maxUber = Math.max(...uberMonths.map(m => m.amount), 1);

  const hasDriver = totalDriver > 0;
  const hasUber = totalUber > 0;

  if (!hasDriver && !hasUber) return null;

  const driverActiveMonths = driverMonths.filter(m => m.amount > 0).length;
  const uberActiveMonths = uberMonths.filter(m => m.amount > 0).length;

  return (
    <Card>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-foreground uppercase text-[10px] tracking-widest">Travel History</CardTitle>
          <span className="text-[10px] text-muted-foreground">Last 6 months</span>
        </div>
        <div className="flex gap-2 mt-1.5">
          <div className="flex-1 bg-muted/40 rounded-lg p-2 text-center">
            <p className="text-[9px] text-muted-foreground">All-time Driver</p>
            <p className="text-xs font-bold">{formatCurrency(totalDriver)}</p>
          </div>
          <div className="flex-1 bg-muted/40 rounded-lg p-2 text-center">
            <p className="text-[9px] text-muted-foreground">All-time Uber</p>
            <p className="text-xs font-bold">{formatCurrency(totalUber)}</p>
          </div>
          <div className="flex-1 bg-muted/40 rounded-lg p-2 text-center">
            <p className="text-[9px] text-muted-foreground">Combined Total</p>
            <p className="text-xs font-bold">{formatCurrency(totalDriver + totalUber)}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0 space-y-4">
        {hasDriver && (
          <Section
            title="Transportation"
            totalLabel={`${driverActiveMonths} paid month${driverActiveMonths !== 1 ? 's' : ''}`}
            totalValue={totalDriver}
          >
            {driverMonths.map(m => (
              <div key={format(m.monthDate, 'yyyy-MM')} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-foreground w-16 shrink-0">{format(m.monthDate, 'MMM yyyy')}</span>
                  <div className="flex items-center gap-2 flex-1">
                    <MonthBar value={m.amount} max={maxDriver} color="bg-primary/70" />
                    <span className="text-[10px] font-bold text-foreground whitespace-nowrap min-w-[52px] text-right">
                      {m.amount > 0 ? formatCurrency(m.amount) : '—'}
                    </span>
                  </div>
                </div>
                {(m.full > 0 || m.half > 0) && (
                  <p className="text-[9px] text-muted-foreground pl-16">
                    {m.full} full{m.half > 0 ? ` · ${m.half} half` : ''} days
                  </p>
                )}
              </div>
            ))}
          </Section>
        )}

        {hasDriver && hasUber && <div className="border-t border-border" />}

        {hasUber && (
          <Section
            title="Uber"
            totalLabel={`${uberMonths.reduce((s, m) => s + m.rideCount, 0)} rides total`}
            totalValue={totalUber}
          >
            {uberMonths.map(m => (
              <div key={format(m.monthDate, 'yyyy-MM')} className="flex items-center justify-between">
                <span className="text-[10px] text-foreground w-16 shrink-0">{format(m.monthDate, 'MMM yyyy')}</span>
                <div className="flex items-center gap-2 flex-1">
                  <MonthBar value={m.amount} max={maxUber} color="bg-accent/60" />
                  <span className="text-[10px] font-bold text-foreground whitespace-nowrap min-w-[52px] text-right">
                    {m.amount > 0 ? formatCurrency(m.amount) : '—'}
                  </span>
                </div>
                {m.rideCount > 0 && (
                  <span className="text-[9px] text-muted-foreground ml-1 whitespace-nowrap">{m.rideCount}r</span>
                )}
              </div>
            ))}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}
