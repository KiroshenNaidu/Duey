'use client';

import { useCallback, useContext, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import { TransportStatusCard } from '@/components/TransportStatusCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CardHeading } from '@/components/ui/card';
import { StatPill } from '@/components/stats/StatPrimitives';
import { SavingsTab } from '@/components/SavingsTab';
import { CardGrid, type GridCard } from '@/components/cards/CardGrid';
import type { CardSize } from '@/lib/cardLayout';
import { add, format, getDaysInMonth, isWeekend, startOfMonth } from 'date-fns';
import {
  calculateGlobalStats, calculateLiveMonthly, calculateSealedCycleSummary, cycleKey,
  cycleLabelFromKey, cycleStartFromKey, displayProgressPct, getPayCycle, isTransportPaidForMonth,
  type MonthlyMoney,
} from '@/lib/calculations';
import {
  CycleNavigatorCard, SpendBreakdownCard, cycleKeysBetween, sumMonthlyMoney,
  type CyclePoint, type CycleSelection,
} from '@/components/stats/CycleCharts';
import {
  TrendingUp, Car, CreditCard, CalendarRange, Scale, PieChart, LayoutGrid,
  ReceiptText, Wallet, ArrowUpRight, ArrowDownRight, BadgeDollarSign,
} from 'lucide-react';

/**
 * Stats → Overview and Stats → Savings.
 *
 * Both are card grids (components/cards/CardGrid): hold any card to move, resize or hide
 * it, and "Add card" brings back the ones that start tucked away. Overview opens on the
 * pay-cycle picture — the chart, in/out/net, where the money went — with debts and income
 * alongside; the rest of the figures wait in "Add card" rather than crowding the page.
 */

// ─── Debts ─────────────────────────────────────────────────────────────────────

const DONUT_RADIUS = 38;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

function DebtHeroCard({ size }: { size: CardSize }) {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  // Credited (per-debt clamped) paid, so the ring and the % agree with the per-debt bars
  // instead of being inflated by an overpayment on one debt.
  const progress = stats.globalTotalDebt > 0 ? stats.globalCreditedPaid / stats.globalTotalDebt : 0;
  const pct = displayProgressPct(progress * 100);
  const offset = DONUT_CIRC * (1 - Math.min(progress, 1));

  // Re-runs the ring-fill every time the Stats page becomes active (swipe or tab),
  // not just on first mount — the carousel keeps this page permanently mounted.
  const ready = useReplayOnActive('/stats');
  const small = size === 'small';

  const ring = (
    <div className={cn('relative shrink-0', small ? 'w-16 h-16' : 'w-24 h-24')}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={DONUT_RADIUS} fill="none" strokeWidth="9" className="stroke-muted-foreground/10" />
        <circle
          cx="50" cy="50" r={DONUT_RADIUS} fill="none" strokeWidth="9"
          strokeDasharray={DONUT_CIRC}
          strokeDashoffset={ready ? offset : DONUT_CIRC}
          strokeLinecap="round"
          // Transition only while filling, so the reset to empty on re-entry is instant.
          className={cn('stroke-animated', ready && 'transition-all duration-700')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-bold text-foreground leading-none', small ? 'text-sm' : 'text-[17px]')}>{pct}%</span>
        <span className="text-[9px] text-muted-foreground mt-0.5">paid off</span>
      </div>
    </div>
  );

  if (small) {
    return (
      <div className="bg-card rounded-2xl p-4 h-full">
        <CardHeading icon={CreditCard} title="Debts" iconClassName="text-primary" />
        {ring}
        <p className="mt-2 text-sm font-bold tabular-nums text-foreground truncate">{formatCurrency(stats.globalRemainingBalance)}</p>
        <p className="text-[10px] text-muted-foreground">still owed</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-5 h-full flex items-center gap-5">
      {ring}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Debt remaining</p>
        <p className="text-2xl font-bold text-foreground leading-tight truncate mt-0.5">
          {formatCurrency(stats.globalRemainingBalance)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 truncate">of {formatCurrency(stats.globalTotalDebt)} total</p>
        {stats.globalCreditedPaid > 0 && (
          <p className="text-xs text-[hsl(var(--positive))] font-medium mt-0.5 truncate">
            {formatCurrency(stats.globalCreditedPaid)} paid
            {stats.globalOverpaid > 0 && (
              <span className="text-muted-foreground"> · {formatCurrency(stats.globalOverpaid)} over</span>
            )}
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
    { label: 'Paid',      value: formatCurrency(stats.globalAmountPaid),  icon: TrendingUp, color: 'text-[hsl(var(--positive))]' },
    { label: 'Transport', value: formatCurrency(stats.totalTransportPaid), icon: Car,        color: 'text-[hsl(var(--cat-transport))]' },
    { label: 'Debts',     value: String(debts.length),                     icon: CreditCard, color: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {pills.map(({ label, value, icon, color }) => (
        <StatPill key={label} icon={icon} label={label} value={value} color={color} />
      ))}
    </div>
  );
}

// ─── Shared pieces ─────────────────────────────────────────────────────────────

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

/** The 1×1 form of a figure card: its heading, one number, one line under it. */
function SmallFigure({ icon, title, iconClassName, value, valueClassName, sub }: {
  icon: React.ElementType; title: string; iconClassName?: string;
  value: string; valueClassName?: string; sub?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading icon={icon} title={title} iconClassName={iconClassName} />
      <p className={cn('text-lg font-bold tabular-nums truncate', valueClassName ?? 'text-foreground')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ─── Income, expenses, budget, transport ──────────────────────────────────────

function IncomeCard({ size }: { size: CardSize }) {
  const { monthlyIncome, extraIncomes } = useContext(AppDataContext);
  const extraTotal = extraIncomes.reduce((s, e) => s + e.amount, 0);
  const total = monthlyIncome + extraTotal;

  if (size === 'small') {
    return (
      <SmallFigure
        icon={BadgeDollarSign} title="Income" iconClassName="text-[hsl(var(--positive))]"
        value={formatCurrency(total)} valueClassName="text-[hsl(var(--positive))]"
        sub={extraIncomes.length ? `salary + ${extraIncomes.length} extra` : 'salary'}
      />
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading icon={BadgeDollarSign} title="Income" iconClassName="text-[hsl(var(--positive))]" />
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

function ExpensesCard({ size }: { size: CardSize }) {
  const { expenses } = useContext(AppDataContext);
  const recurring = expenses.filter(e => e.recurring);
  const oneTime = expenses.filter(e => !e.recurring);
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  if (size === 'small') {
    return (
      <SmallFigure
        icon={ReceiptText} title="Expenses" iconClassName="text-[hsl(var(--cat-expense))]"
        value={formatCurrency(total)} valueClassName="text-[hsl(var(--negative))]"
        sub={`${expenses.length} logged`}
      />
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading
        icon={ReceiptText}
        title="Expenses"
        iconClassName="text-[hsl(var(--cat-expense))]"
        aside={`${expenses.length} logged`}
      />
      <StatRow label="Recurring"  value={formatCurrency(recurring.reduce((s, e) => s + e.amount, 0))} sub={`${recurring.length} item${recurring.length !== 1 ? 's' : ''} · stays each cycle`}  color="text-[hsl(var(--cat-expense))]" />
      <StatRow label="One-time"   value={formatCurrency(oneTime.reduce((s, e) => s + e.amount, 0))}  sub={`${oneTime.length} item${oneTime.length !== 1 ? 's' : ''} · clears on pay date`} />
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
        <p className="text-sm font-bold text-foreground">Total</p>
        <p className="text-base font-bold text-[hsl(var(--negative))]">{formatCurrency(total)}</p>
      </div>
    </div>
  );
}

function BudgetCard({ size }: { size: CardSize }) {
  const { budgetPlans } = useContext(AppDataContext);
  // Archived plans are hidden from the Budget tab entirely (they only stay in state so
  // their confirmed spend keeps counting for the month it was confirmed), so they stay out
  // of these totals too.
  const activePlans = useMemo(() => budgetPlans.filter(p => !p.archived), [budgetPlans]);
  const totalBudget = activePlans.reduce((s, p) => s + p.budget, 0);
  const totalSpent  = activePlans.reduce((s, p) => s + p.items.reduce((si, i) => si + i.price, 0), 0);
  const remaining   = totalBudget - totalSpent;
  const remainingColor = remaining >= 0 ? 'text-[hsl(var(--positive))]' : 'text-[hsl(var(--negative))]';

  if (size === 'small') {
    return (
      <SmallFigure
        icon={Wallet} title="Budget" iconClassName="text-[hsl(var(--cat-budget))]"
        value={formatCurrency(remaining)} valueClassName={remainingColor} sub="unallocated"
      />
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading
        icon={Wallet}
        title="Budget Plans"
        iconClassName="text-[hsl(var(--cat-budget))]"
        aside={`${activePlans.length} plan${activePlans.length !== 1 ? 's' : ''}`}
      />
      <StatRow label="Total budgeted"     value={formatCurrency(totalBudget)} />
      <StatRow label="Allocated to items" value={formatCurrency(totalSpent)}  color="text-[hsl(var(--cat-expense))]" />
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
        <p className="text-sm font-bold text-foreground">Unallocated</p>
        <p className={cn('text-base font-bold', remainingColor)}>{formatCurrency(remaining)}</p>
      </div>
    </div>
  );
}

function TransportExtrasCard({ size }: { size: CardSize }) {
  const { uberRides, transportSettings, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats([], history), [history]);
  const uberTotal = uberRides.reduce((s, r) => s + r.price, 0);
  // Count the actual weekdays in THIS month (they range 20–23) rather than a flat 22.
  const workdaysThisMonth = useMemo(() => {
    const start = startOfMonth(new Date());
    let n = 0;
    for (let i = 0; i < getDaysInMonth(start); i++) if (!isWeekend(add(start, { days: i }))) n++;
    return n;
  }, []);
  const monthlyEstimate = transportSettings.pricingMode === 'monthly'
    ? transportSettings.monthlyFee
    : transportSettings.dailyFee * workdaysThisMonth;

  if (size === 'small') {
    return (
      <SmallFigure
        icon={Car} title="Transport" iconClassName="text-[hsl(var(--cat-transport))]"
        value={formatCurrency(stats.totalTransportPaid)} valueClassName="text-[hsl(var(--cat-transport))]"
        sub="paid all-time"
      />
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading icon={Car} title="Transport Totals" iconClassName="text-[hsl(var(--cat-transport))]" />
      <StatRow label="All-time paid"     value={formatCurrency(stats.totalTransportPaid)} color="text-[hsl(var(--cat-transport))]" />
      <StatRow label="Uber / rides"      value={formatCurrency(uberTotal)} sub={`${uberRides.length} trip${uberRides.length !== 1 ? 's' : ''}`} />
      <StatRow label="Monthly estimate"  value={formatCurrency(monthlyEstimate)} sub={transportSettings.pricingMode === 'monthly' ? 'Fixed fee' : `${formatCurrency(transportSettings.dailyFee)}/day × ${workdaysThisMonth} weekdays`} />
    </div>
  );
}

// ─── Pay cycle ─────────────────────────────────────────────────────────────────

/** In, out, net for the picked cycle (or span of cycles). */
function CycleSummaryCard({ money, live, transportPaid, span, size }: {
  money: MonthlyMoney; live: boolean; transportPaid: boolean; span: number; size: CardSize;
}) {
  const positive = money.remaining >= 0;
  const netColor = positive ? 'text-[hsl(var(--positive))]' : 'text-[hsl(var(--negative))]';

  if (size === 'small') {
    return (
      <div className="bg-card rounded-2xl p-4 h-full">
        <CardHeading icon={Scale} title="Net" />
        <p className={cn('text-lg font-bold tabular-nums truncate', netColor)}>{formatCurrency(money.remaining)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">in {formatCurrency(money.income)}</p>
        <p className="text-[10px] text-muted-foreground truncate">out {formatCurrency(money.totalOutgoings)}</p>
      </div>
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <div className="grid grid-cols-3 gap-2">
        <Figure label="In" value={money.income} color="text-[hsl(var(--positive))]" />
        <Figure label="Out" value={money.totalOutgoings} color="text-[hsl(var(--negative))]" />
        <Figure label="Net" value={money.remaining} color={netColor} icon={positive ? ArrowUpRight : ArrowDownRight} />
      </div>
      {(span > 1 || (live && !transportPaid)) && (
        <div className="mt-3 pt-2.5 border-t border-border/30 space-y-1">
          {span > 1 && (
            <p className="text-[10px] text-muted-foreground/60">
              Totals across {span} cycles · {formatCurrency(money.totalOutgoings / span)} out per cycle on average.
            </p>
          )}
          {live && !transportPaid && (
            <p className="text-[10px] text-muted-foreground/60">
              Transport is an estimate until it is marked paid.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, color, icon: Icon }: {
  label: string; value: number; color: string; icon?: React.ElementType;
}) {
  // A long span tots up to seven figures, which does not fit a third of the row at
  // text-sm — so the type steps down with the length rather than truncating the amount.
  const text = formatCurrency(value);
  return (
    <div className="min-w-0 text-center">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-1">
        {Icon && <Icon className={cn('h-3 w-3', color)} />}
        {label}
      </p>
      <p className={cn(
        'font-bold tabular-nums truncate mt-1',
        text.length > 12 ? 'text-[10px]' : text.length > 9 ? 'text-xs' : 'text-sm',
        color,
      )}>
        {text}
      </p>
    </div>
  );
}

/**
 * Everything measured per pay cycle, behind one picker. Three cards read it (the chart,
 * in/out/net, where it goes), so the selection lives here rather than in any one of them.
 *
 * A sealed cycle reads its own stored snapshot rather than being recomputed, so a figure
 * here is the figure that was on screen the day it sealed — recomputing drifts once
 * one-time extras and expenses are purged.
 */
function useCycleSelection() {
  const {
    monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides,
    transportSettings, transportOverrides, transportMonthlyOverrides, userProfile, savings, recurringSavings, loans,
  } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const input = useMemo(
    () => ({
      payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
      recurringSavings, loans, transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     recurringSavings, loans, transportSettings, transportOverrides, transportMonthlyOverrides],
  );
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  // The same live calculator the Balance tab runs, so the figures can never disagree.
  const live = useMemo(() => calculateLiveMonthly(input), [input]);

  // Snapshots are dated to their cycle's last day, so the cycle is recoverable from it.
  const snapshots = useMemo(() => {
    const out = new Map<string, MonthlyMoney>();
    for (const h of history) {
      if (h.type !== 'snapshot' || !h.snapshot) continue;
      const key = cycleKey(new Date(h.date), payDay);
      // Old snapshots' stored Remaining ignored loans; 0 keeps each one adding up.
      if (!out.has(key)) out.set(key, { ...h.snapshot, savings: h.snapshot.savings ?? 0, loans: h.snapshot.loans ?? 0 });
    }
    return out;
  }, [history, payDay]);

  // `recorded` means the cycle is running, was sealed, or money actually left it — a
  // recompute for a cycle before you had data still derives today's salary as its income.
  const readCycle = useCallback((key: string) => {
    if (key === cycle.key) return { money: live, recorded: true };
    const snapshot = snapshots.get(key);
    const money = snapshot ?? calculateSealedCycleSummary(input, key);
    return { money, recorded: !!snapshot || money.totalOutgoings > 0 };
  }, [cycle.key, live, snapshots, input]);

  // A SPAN of cycle keys; null follows the running cycle, so a pay date passing never
  // strands you on the old one. Both ends the same key is a single cycle.
  const [picked, setPicked] = useState<{ fromKey: string; toKey: string } | null>(null);
  const fromKey = picked?.fromKey ?? cycle.key;
  const toKey = picked?.toKey ?? cycle.key;

  const selected: CycleSelection = useMemo(() => {
    const keys = cycleKeysBetween(fromKey, toKey, payDay);
    const read = keys.map(readCycle);
    return {
      fromKey: keys[0],
      toKey: keys[keys.length - 1],
      keys,
      // The start carries its own year whenever the span crosses one.
      label: keys.length === 1
        ? (keys[0] === cycle.key ? cycle.label : cycleLabelFromKey(keys[0], payDay))
        : (() => {
            const spanStart = cycleStartFromKey(keys[0], payDay);
            const spanEnd = getPayCycle(payDay, cycleStartFromKey(keys[keys.length - 1], payDay)).lastDay;
            const sameYear = spanStart.getFullYear() === spanEnd.getFullYear();
            return `${format(spanStart, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(spanEnd, 'd MMM yyyy')}`;
          })(),
      live: keys.includes(cycle.key),
      recorded: read.some(r => r.recorded),
      // Every figure on a cycle is a flow over that window, so a span is simply their sum.
      money: keys.length === 1 ? read[0].money : sumMonthlyMoney(read.map(r => r.money)),
    };
  }, [fromKey, toKey, readCycle, cycle.key, cycle.label, payDay]);

  // Every cycle the chart could draw: from the oldest with data (or the selection's start,
  // if that reaches further back) up to the running one.
  const points: CyclePoint[] = useMemo(() => {
    let earliest = cycle.key;
    for (const h of history) {
      const k = cycleKey(new Date(h.date), payDay);
      if (k < earliest) earliest = k;
    }
    if (fromKey < earliest) earliest = fromKey;
    return cycleKeysBetween(earliest, cycle.key, payDay).map(key => {
      const { money, recorded } = readCycle(key);
      return { key, label: cycleLabelFromKey(key, payDay), live: key === cycle.key, recorded, money };
    });
  }, [history, payDay, fromKey, cycle.key, readCycle]);

  return {
    payDay,
    liveKey: cycle.key,
    selected,
    points,
    pick: (a: string, b: string) => setPicked({ fromKey: a, toKey: b }),
    transportPaid: isTransportPaidForMonth(history, new Date()),
  };
}

// ─── Overview grid ────────────────────────────────────────────────────────────

function Overview({ active }: { active: boolean }) {
  const { debts, expenses, budgetPlans } = useContext(AppDataContext);
  const c = useCycleSelection();
  const ready = useReplayOnActive('/stats');
  const hasBudget = budgetPlans.some(p => !p.archived);

  const cards: GridCard[] = [
    {
      id: 'cycle',
      title: 'Pay cycle',
      icon: CalendarRange,
      sizes: ['wide', 'large'],
      defaultSize: 'large',
      // Keyed by size so switching 2×1 ↔ 2×2 opens or shuts the chart to match.
      render: size => (
        <CycleNavigatorCard
          key={size}
          selected={c.selected}
          points={c.points}
          liveKey={c.liveKey}
          payDay={c.payDay}
          onSelectRange={c.pick}
          ready={ready}
          chartOpen={size === 'large'}
        />
      ),
    },
    {
      id: 'summary',
      title: 'In, out & net',
      icon: Scale,
      sizes: ['small', 'wide'],
      defaultSize: 'wide',
      render: size => (
        <CycleSummaryCard
          money={c.selected.money}
          live={c.selected.live}
          transportPaid={c.transportPaid}
          span={c.selected.keys.length}
          size={size}
        />
      ),
    },
    {
      id: 'debts',
      title: 'Debts',
      icon: CreditCard,
      sizes: ['small', 'wide'],
      defaultSize: 'small',
      available: debts.length > 0,
      emptyHint: 'Shows up once you add a debt.',
      render: size => <DebtHeroCard size={size} />,
    },
    {
      id: 'income',
      title: 'Income',
      icon: BadgeDollarSign,
      sizes: ['small', 'wide'],
      defaultSize: 'small',
      render: size => <IncomeCard size={size} />,
    },
    {
      id: 'breakdown',
      title: 'Where it goes',
      icon: PieChart,
      sizes: ['wide'],
      defaultSize: 'wide',
      render: () => <SpendBreakdownCard money={c.selected.money} ready={ready} />,
    },
    {
      id: 'debtProgress',
      title: 'Debt progress',
      icon: CreditCard,
      sizes: ['wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      available: debts.length > 0,
      emptyHint: 'Shows up once you add a debt.',
      render: () => (
        <div className="bg-card rounded-2xl p-4 h-full">
          <CardHeading icon={CreditCard} title="Debt Progress" iconClassName="text-primary" className="mb-3" />
          <DebtProgressCharts />
        </div>
      ),
    },
    {
      id: 'expenses',
      title: 'Expenses',
      icon: ReceiptText,
      sizes: ['small', 'wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      available: expenses.length > 0,
      emptyHint: 'Shows up once you log an expense.',
      render: size => <ExpensesCard size={size} />,
    },
    {
      id: 'budget',
      title: 'Budget plans',
      icon: Wallet,
      sizes: ['small', 'wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      available: hasBudget,
      emptyHint: 'Shows up once you make a budget plan.',
      render: size => <BudgetCard size={size} />,
    },
    {
      id: 'transportStatus',
      title: 'Transport this month',
      icon: Car,
      sizes: ['wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      render: () => <TransportStatusCard />,
    },
    {
      id: 'transportTotals',
      title: 'Transport totals',
      icon: Car,
      sizes: ['small', 'wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      render: size => <TransportExtrasCard size={size} />,
    },
    {
      id: 'quickStats',
      title: 'Quick stats',
      icon: LayoutGrid,
      sizes: ['wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      render: () => <StatPills />,
    },
  ];

  return (
    <div>
      <CardGrid pageId="stats" cards={cards} active={active} />
      <p className="mt-4 text-center text-[10px] text-muted-foreground/60">
        Tip: hold any card to move, resize or hide it.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StatsPage() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container mx-auto max-w-md space-y-3 pt-11 pb-4">
      {/* Two views of the same money: what it is doing now (Overview) and what survived
          each pay cycle (Savings). Same tab strip the Money page uses. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="tabs-fluid w-full">
          <TabsTrigger value="overview" className="flex-auto">Overview</TabsTrigger>
          <TabsTrigger value="savings" className="flex-auto">Savings</TabsTrigger>
        </TabsList>

        <TabsContent value="savings" className="space-y-3">
          <SavingsTab />
        </TabsContent>

        <TabsContent value="overview" className="space-y-3">
          <Overview active={pathname === '/stats' && activeTab === 'overview'} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
