'use client';

import { useContext, useMemo } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, cn } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { HistoryLog } from '@/components/HistoryLog';
import { TransportStatusCard } from '@/components/TransportStatusCard';
import { calculateGlobalStats } from '@/lib/calculations';
import { TrendingUp, Car, CreditCard } from 'lucide-react';

const DONUT_RADIUS = 38;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

function DebtHeroCard() {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  const progress = stats.globalTotalDebt > 0 ? stats.globalAmountPaid / stats.globalTotalDebt : 0;
  const pct = Math.min(100, Math.round(progress * 100));
  const offset = DONUT_CIRC * (1 - Math.min(progress, 1));

  return (
    <div className="bg-card rounded-3xl p-5 flex items-center gap-5">
      <div className="relative shrink-0 w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={DONUT_RADIUS}
            fill="none" strokeWidth="9"
            className="stroke-muted-foreground/10"
          />
          <circle
            cx="50" cy="50" r={DONUT_RADIUS}
            fill="none" strokeWidth="9"
            strokeDasharray={DONUT_CIRC}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="stroke-accent transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-bold text-foreground leading-none">{pct}%</span>
          <span className="text-[9px] text-muted-foreground mt-0.5">paid off</span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Remaining</p>
        <p className="text-2xl font-bold text-foreground leading-tight truncate mt-0.5">
          {formatCurrency(stats.globalRemainingBalance)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          of {formatCurrency(stats.globalTotalDebt)} total
        </p>
        {stats.globalAmountPaid > 0 && (
          <p className="text-xs text-green-500 font-medium mt-0.5 truncate">
            {formatCurrency(stats.globalAmountPaid)} paid
          </p>
        )}
      </div>
    </div>
  );
}

function StatPills() {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  const pills = [
    { label: 'Paid',      value: formatCurrency(stats.globalAmountPaid),   icon: TrendingUp, color: 'text-green-500' },
    { label: 'Transport', value: formatCurrency(stats.totalTransportPaid),  icon: Car,        color: 'text-accent' },
    { label: 'Debts',     value: String(debts.length),                      icon: CreditCard, color: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {pills.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-card rounded-2xl p-3 flex flex-col gap-1.5">
          <Icon className={cn('h-3.5 w-3.5', color)} />
          <p className={cn('text-sm font-bold leading-tight truncate', color)}>{value}</p>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const { debts, history } = useContext(AppDataContext);

  return (
    <div className="container mx-auto max-w-md space-y-3 pt-11 pb-4">

      <DebtHeroCard />

      <StatPills />

      <TransportStatusCard />

      {debts.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Debt Progress</p>
            <DebtProgressCharts />
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Payment History</p>
          <HistoryLog />
        </section>
      )}

    </div>
  );
}
