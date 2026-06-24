'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, cn } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { TransportStatusCard } from '@/components/TransportStatusCard';
import { calculateGlobalStats } from '@/lib/calculations';
import {
  TrendingUp, Car, CreditCard, TrendingDown,
  ReceiptText, PiggyBank, ArrowUpRight, ArrowDownRight, BadgeDollarSign,
} from 'lucide-react';

// ─── Original hero constants ───────────────────────────────────────────────────

const DONUT_RADIUS = 38;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

// ─── ORIGINAL: Debt hero card with donut ──────────────────────────────────────

function DebtHeroCard() {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  const progress = stats.globalTotalDebt > 0 ? stats.globalAmountPaid / stats.globalTotalDebt : 0;
  const pct = Math.min(100, Math.round(progress * 100));
  const offset = DONUT_CIRC * (1 - Math.min(progress, 1));

  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="bg-card rounded-3xl p-5 flex items-center gap-5">
      <div className="relative shrink-0 w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={DONUT_RADIUS} fill="none" strokeWidth="9" className="stroke-muted-foreground/10" />
          <circle
            cx="50" cy="50" r={DONUT_RADIUS} fill="none" strokeWidth="9"
            strokeDasharray={DONUT_CIRC}
            strokeDashoffset={ready ? offset : DONUT_CIRC}
            strokeLinecap="round"
            className="stroke-animated transition-all duration-700"
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
        <p className="text-xs text-muted-foreground mt-1 truncate">of {formatCurrency(stats.globalTotalDebt)} total</p>
        {stats.globalAmountPaid > 0 && (
          <p className="text-xs text-[hsl(var(--positive))] font-medium mt-0.5 truncate">
            {formatCurrency(stats.globalAmountPaid)} paid
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ORIGINAL: 3-pill stat strip ──────────────────────────────────────────────

function StatPills() {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  const pills = [
    { label: 'Paid',      value: formatCurrency(stats.globalAmountPaid),  icon: TrendingUp, color: 'text-[hsl(var(--positive))]' },
    { label: 'Transport', value: formatCurrency(stats.totalTransportPaid), icon: Car,        color: 'text-[hsl(var(--cat-transport))]' },
    { label: 'Debts',     value: String(debts.length),                     icon: CreditCard, color: 'text-primary' },
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

// ─── NEW: helper row ───────────────────────────────────────────────────────────

function StatRow({ label, value, sub, color = 'text-foreground', bold = false }: {
  label: string; value: string; sub?: string; color?: string; bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <div>
        <p className={cn('text-sm', bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
      <p className={cn('text-sm font-semibold tabular-nums', color)}>{value}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">{children}</p>;
}

// ─── NEW: Income card ──────────────────────────────────────────────────────────

function IncomeCard() {
  const { monthlyIncome, extraIncomes } = useContext(AppDataContext);
  const extraTotal = extraIncomes.reduce((s, e) => s + e.amount, 0);
  const total = monthlyIncome + extraTotal;

  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <BadgeDollarSign className="h-4 w-4 text-[hsl(var(--positive))]" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Income</p>
      </div>
      <StatRow label="Monthly salary" value={formatCurrency(monthlyIncome)} />
      {extraIncomes.map(e => (
        <StatRow key={e.id} label={e.label} value={`+ ${formatCurrency(e.amount)}`} color="text-[hsl(var(--positive))]" />
      ))}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
        <p className="text-sm font-bold text-foreground">Total Income</p>
        <p className="text-base font-bold text-[hsl(var(--positive))]">{formatCurrency(total)}</p>
      </div>
    </div>
  );
}

// ─── NEW: Monthly net overview ─────────────────────────────────────────────────

function MonthlyOverviewCard() {
  const { monthlyIncome, extraIncomes, expenses, debts, transportSettings } = useContext(AppDataContext);

  const totalIncome = monthlyIncome + extraIncomes.reduce((s, e) => s + e.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const monthlyDebt = debts.reduce((s, d) => s + d.installment_amount, 0);
  const monthlyTransport = transportSettings.pricingMode === 'monthly'
    ? transportSettings.monthlyFee
    : transportSettings.dailyFee * 22;

  const net = totalIncome - totalExpenses - monthlyDebt - monthlyTransport;
  const positive = net >= 0;

  return (
    <div className="bg-card rounded-2xl p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Monthly Snapshot</p>
      <StatRow label="Income"             value={formatCurrency(totalIncome)}     color="text-[hsl(var(--positive))]" />
      <StatRow label="Expenses"           value={`− ${formatCurrency(totalExpenses)}`}   color="text-[hsl(var(--negative))]" sub={`${expenses.length} item${expenses.length !== 1 ? 's' : ''}`} />
      <StatRow label="Debt installments"  value={`− ${formatCurrency(monthlyDebt)}`}     color="text-[hsl(var(--cat-budget))]" sub={`${debts.length} debt${debts.length !== 1 ? 's' : ''}`} />
      <StatRow label="Transport"          value={`− ${formatCurrency(monthlyTransport)}`} color="text-[hsl(var(--cat-transport))]" />
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          {positive
            ? <ArrowUpRight className="h-4 w-4 text-[hsl(var(--positive))]" />
            : <ArrowDownRight className="h-4 w-4 text-[hsl(var(--negative))]" />}
          <p className="text-sm font-bold text-foreground">Net</p>
        </div>
        <p className={cn('text-base font-bold', positive ? 'text-[hsl(var(--positive))]' : 'text-[hsl(var(--negative))]')}>
          {formatCurrency(net)}
        </p>
      </div>
    </div>
  );
}

// ─── NEW: Expenses breakdown ───────────────────────────────────────────────────

function ExpensesCard() {
  const { expenses } = useContext(AppDataContext);
  const recurring = expenses.filter(e => e.recurring);
  const oneTime = expenses.filter(e => !e.recurring);
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  if (expenses.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <ReceiptText className="h-4 w-4 text-[hsl(var(--cat-expense))]" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expenses</p>
        <span className="ml-auto text-xs text-muted-foreground">{expenses.length} logged</span>
      </div>
      <StatRow label="Recurring"  value={formatCurrency(recurring.reduce((s, e) => s + e.amount, 0))} sub={`${recurring.length} item${recurring.length !== 1 ? 's' : ''} · stays each month`}  color="text-[hsl(var(--cat-expense))]" />
      <StatRow label="One-time"   value={formatCurrency(oneTime.reduce((s, e) => s + e.amount, 0))}  sub={`${oneTime.length} item${oneTime.length !== 1 ? 's' : ''} · clears on 1st`} />
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
        <p className="text-sm font-bold text-foreground">Total</p>
        <p className="text-base font-bold text-[hsl(var(--negative))]">{formatCurrency(total)}</p>
      </div>
    </div>
  );
}

// ─── NEW: Budget plans ─────────────────────────────────────────────────────────

function BudgetCard() {
  const { budgetPlans } = useContext(AppDataContext);
  if (budgetPlans.length === 0) return null;

  const totalBudget = budgetPlans.reduce((s, p) => s + p.budget, 0);
  const totalSpent  = budgetPlans.reduce((s, p) => s + p.items.reduce((si, i) => si + i.price, 0), 0);
  const remaining   = totalBudget - totalSpent;

  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <PiggyBank className="h-4 w-4 text-[hsl(var(--cat-completion))]" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget Plans</p>
        <span className="ml-auto text-xs text-muted-foreground">{budgetPlans.length} plan{budgetPlans.length !== 1 ? 's' : ''}</span>
      </div>
      <StatRow label="Total budgeted"     value={formatCurrency(totalBudget)} />
      <StatRow label="Allocated to items" value={formatCurrency(totalSpent)}  color="text-[hsl(var(--cat-expense))]" />
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
        <p className="text-sm font-bold text-foreground">Unallocated</p>
        <p className={cn('text-base font-bold', remaining >= 0 ? 'text-[hsl(var(--positive))]' : 'text-[hsl(var(--negative))]')}>
          {formatCurrency(remaining)}
        </p>
      </div>
    </div>
  );
}

// ─── NEW: Extra transport stats ────────────────────────────────────────────────

function TransportExtrasCard() {
  const { uberRides, transportSettings, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats([], history), [history]);
  const uberTotal = uberRides.reduce((s, r) => s + r.price, 0);
  const monthlyEstimate = transportSettings.pricingMode === 'monthly'
    ? transportSettings.monthlyFee
    : transportSettings.dailyFee * 22;

  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Car className="h-4 w-4 text-[hsl(var(--cat-transport))]" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transport Totals</p>
      </div>
      <StatRow label="All-time paid"     value={formatCurrency(stats.totalTransportPaid)} color="text-[hsl(var(--cat-transport))]" />
      <StatRow label="Uber / rides"      value={formatCurrency(uberTotal)} sub={`${uberRides.length} trip${uberRides.length !== 1 ? 's' : ''}`} />
      <StatRow label="Monthly estimate"  value={formatCurrency(monthlyEstimate)} sub={transportSettings.pricingMode === 'monthly' ? 'Fixed fee' : `${formatCurrency(transportSettings.dailyFee)}/day × ~22 days`} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StatsPage() {
  const { debts, history, expenses, budgetPlans } = useContext(AppDataContext);

  return (
    <div className="container mx-auto max-w-md space-y-3 pt-11 pb-4">

      {/* ── ORIGINAL LAYOUT ── */}
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

      {/* ── NEW SECTIONS ── */}
      <div className="space-y-2 pt-1">
        <SectionLabel>Income</SectionLabel>
        <IncomeCard />
      </div>

      <div className="space-y-2">
        <SectionLabel>Monthly Overview</SectionLabel>
        <MonthlyOverviewCard />
      </div>

      {expenses.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Expenses</SectionLabel>
          <ExpensesCard />
        </div>
      )}

      {budgetPlans.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Budget</SectionLabel>
          <BudgetCard />
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel>Transport</SectionLabel>
        <TransportExtrasCard />
      </div>

    </div>
  );
}
