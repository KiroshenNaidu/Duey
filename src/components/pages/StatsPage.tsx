'use client';

import { useCallback, useContext, useMemo, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import { TransportStatusCard } from '@/components/TransportStatusCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CardHeading } from '@/components/ui/card';
import { StatPill } from '@/components/stats/StatPrimitives';
import { SavingsTab } from '@/components/SavingsTab';
import { add, format, getDaysInMonth, isWeekend, startOfMonth } from 'date-fns';
import {
  calculateGlobalStats, calculateLiveMonthly, calculateSealedCycleSummary, cycleKey,
  cycleLabelFromKey, cycleStartFromKey, displayProgressPct, getPayCycle, isTransportPaidForMonth,
  listRecentCycles, type MonthlyMoney,
} from '@/lib/calculations';
import {
  CycleNavigatorCard, SpendBreakdownCard, cycleKeysBetween, sumMonthlyMoney,
  type CyclePoint, type CycleSelection,
} from '@/components/stats/CycleCharts';
import {
  TrendingUp, Car, CreditCard,
  ReceiptText, Wallet, ArrowUpRight, ArrowDownRight, BadgeDollarSign,
} from 'lucide-react';

// ─── Original hero constants ───────────────────────────────────────────────────

const DONUT_RADIUS = 38;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

// ─── ORIGINAL: Debt hero card with donut ──────────────────────────────────────

function DebtHeroCard() {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  // Credited (per-debt clamped) paid, so the ring and the % agree with the per-debt bars
  // below instead of being inflated by an overpayment on one debt.
  const progress = stats.globalTotalDebt > 0 ? stats.globalCreditedPaid / stats.globalTotalDebt : 0;
  const pct = displayProgressPct(progress * 100);
  const offset = DONUT_CIRC * (1 - Math.min(progress, 1));

  // Re-runs the ring-fill every time the Stats page becomes active (swipe or tab),
  // not just on first mount — the carousel keeps this page permanently mounted.
  const ready = useReplayOnActive('/stats');

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
            // Transition only while filling, so the reset to empty on re-entry is instant
            // (no reverse-unwind animation).
            className={cn('stroke-animated', ready && 'transition-all duration-700')}
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
      {pills.map(({ label, value, icon, color }) => (
        <StatPill key={label} icon={icon} label={label} value={value} color={color} />
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

// ─── NEW: Pay-cycle section (picker + charts) ─────────────────────────────────

/** The three figures the cycle comes down to, before any chart explains them. Over a span
 *  of cycles they are that span's totals — and the per-cycle average is worth a line,
 *  because "R42 000 out" means nothing until you know it covers six pays. */
function CycleSummaryCard({ money, live, transportPaid, span }: {
  money: MonthlyMoney; live: boolean; transportPaid: boolean; span: number;
}) {
  const positive = money.remaining >= 0;
  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="grid grid-cols-3 gap-2">
        <Figure label="In" value={money.income} color="text-[hsl(var(--positive))]" />
        <Figure label="Out" value={money.totalOutgoings} color="text-[hsl(var(--negative))]" />
        <Figure
          label="Net"
          value={money.remaining}
          color={positive ? 'text-[hsl(var(--positive))]' : 'text-[hsl(var(--negative))]'}
          icon={positive ? ArrowUpRight : ArrowDownRight}
        />
      </div>
      {/* One footnote rule, however many notes sit under it. */}
      {(span > 1 || (live && !transportPaid)) && (
        <div className="mt-3 pt-2.5 border-t border-border/30 space-y-1">
          {span > 1 && (
            <p className="text-[10px] text-muted-foreground/60">
              Totals across {span} cycles · {formatCurrency(money.totalOutgoings / span)} out per cycle on average.
            </p>
          )}
          {/* The one figure on this card that is not yet fact — worth saying so, and only
              while the cycle is still open (a sealed cycle's transport is settled). */}
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
  // A span of four years tots up to seven figures, which does not fit a third of the row at
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
 * Everything that is measured per pay cycle, under one picker.
 *
 * The timeline is every cycle the app has sealed plus the one still running, oldest first.
 * A sealed cycle reads its own stored snapshot rather than being recomputed, so a figure
 * here is the figure that was on screen the day it sealed — recomputing drifts once
 * one-time extras and expenses are purged. (Snapshots written before that field existed
 * have none, and only those fall back to a recompute.)
 */
function CycleSection() {
  const {
    monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides,
    transportSettings, transportOverrides, transportMonthlyOverrides, userProfile, savings, recurringSavings,
  } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const input = useMemo(
    () => ({
      payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
      recurringSavings, transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     recurringSavings, transportSettings, transportOverrides, transportMonthlyOverrides],
  );
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  // The same live calculator the Balance tab runs, so the open cycle's figures here and
  // there can never disagree.
  const live = useMemo(() => calculateLiveMonthly(input), [input]);

  // Snapshots are dated to their cycle's last day, so the cycle is recoverable from it.
  const snapshots = useMemo(() => {
    const out = new Map<string, MonthlyMoney>();
    for (const h of history) {
      if (h.type !== 'snapshot' || !h.snapshot) continue;
      const key = cycleKey(new Date(h.date), payDay);
      if (!out.has(key)) out.set(key, { ...h.snapshot, savings: h.snapshot.savings ?? 0 });
    }
    return out;
  }, [history, payDay]);

  // Any cycle, named by key. A recompute for a cycle from before you had data still
  // derives an income from today's salary, so "has income" proves nothing — `recorded`
  // means it is running, it was sealed, or money actually left it.
  const readCycle = useCallback((key: string) => {
    if (key === cycle.key) return { money: live, recorded: true };
    const snapshot = snapshots.get(key);
    const money = snapshot ?? calculateSealedCycleSummary(input, key);
    return { money, recorded: !!snapshot || money.totalOutgoings > 0 };
  }, [cycle.key, live, snapshots, input]);

  // The selection is a SPAN of cycle keys, not indices: the date picker can name cycles
  // from any year, which no fixed window would have contained. null follows the running
  // cycle, so a cycle rolling over never strands you on a stale one. Both ends the same key
  // is a single cycle — the ordinary case, and what the chevrons and the chart produce.
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
      // A span is named by the days it actually covers; a single cycle keeps its own label.
      // The start carries its own year whenever the span crosses one — without it a range
      // reaching years back reads as this year's ("25 Aug – 24 Sep 2026") and hides that it
      // starts in 2022. Same-year spans stay short, since the end already names the year.
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

  // Every cycle the chart could be asked to draw: from the oldest one there is data for (or
  // the start of the current selection, if that reaches further back) up to the live one.
  // It used to be a fixed rolling year, which meant picking a four-year span still drew the
  // last twelve cycles — the figures moved and the line did not.
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

  const ready = useReplayOnActive('/stats');
  const transportPaid = isTransportPaidForMonth(history, new Date());

  return (
    <div className="space-y-2">
      <SectionLabel>{selected.keys.length > 1 ? 'Pay cycles' : 'Pay cycle'}</SectionLabel>
      <CycleNavigatorCard
        selected={selected}
        points={points}
        liveKey={cycle.key}
        payDay={payDay}
        onSelectRange={(a, b) => setPicked({ fromKey: a, toKey: b })}
        ready={ready}
      />
      <CycleSummaryCard
        money={selected.money}
        live={selected.live}
        transportPaid={transportPaid}
        span={selected.keys.length}
      />
      <SpendBreakdownCard money={selected.money} ready={ready} />
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

// ─── NEW: Budget plans ─────────────────────────────────────────────────────────

function BudgetCard() {
  const { budgetPlans } = useContext(AppDataContext);
  // Archived plans are hidden from the Budget tab entirely (they only stay in state so
  // their confirmed spend keeps counting for the month it was confirmed). Including them
  // here made these totals disagree with every plan the user can actually see — a plan
  // they archived months ago kept inflating "Total budgeted" with no way to find it.
  const activePlans = useMemo(() => budgetPlans.filter(p => !p.archived), [budgetPlans]);
  if (activePlans.length === 0) return null;

  const totalBudget = activePlans.reduce((s, p) => s + p.budget, 0);
  const totalSpent  = activePlans.reduce((s, p) => s + p.items.reduce((si, i) => si + i.price, 0), 0);
  const remaining   = totalBudget - totalSpent;

  return (
    <div className="bg-card rounded-2xl p-4">
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
  // Daily-rate estimate was a flat "× 22 days", which is wrong for every month that
  // doesn't happen to have 22 weekdays (they range 20–23) — up to ~R270 off at R90/day.
  // Count the actual weekdays in THIS month instead; it costs one cheap loop and the
  // sub-label names the real figure.
  const workdaysThisMonth = useMemo(() => {
    const start = startOfMonth(new Date());
    let n = 0;
    for (let i = 0; i < getDaysInMonth(start); i++) if (!isWeekend(add(start, { days: i }))) n++;
    return n;
  }, []);
  const monthlyEstimate = transportSettings.pricingMode === 'monthly'
    ? transportSettings.monthlyFee
    : transportSettings.dailyFee * workdaysThisMonth;

  return (
    <div className="bg-card rounded-2xl p-4">
      <CardHeading icon={Car} title="Transport Totals" iconClassName="text-[hsl(var(--cat-transport))]" />
      <StatRow label="All-time paid"     value={formatCurrency(stats.totalTransportPaid)} color="text-[hsl(var(--cat-transport))]" />
      <StatRow label="Uber / rides"      value={formatCurrency(uberTotal)} sub={`${uberRides.length} trip${uberRides.length !== 1 ? 's' : ''}`} />
      <StatRow label="Monthly estimate"  value={formatCurrency(monthlyEstimate)} sub={transportSettings.pricingMode === 'monthly' ? 'Fixed fee' : `${formatCurrency(transportSettings.dailyFee)}/day × ${workdaysThisMonth} weekdays`} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StatsPage() {
  const { debts, expenses, budgetPlans } = useContext(AppDataContext);
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

      {/* Dated content first — the picker at its head re-dates everything down to the
          trend chart. Everything below that section is all-time or as-things-stand-now. */}
      <CycleSection />

      {/* ── ORIGINAL LAYOUT ── */}
      <DebtHeroCard />
      <StatPills />
      <TransportStatusCard />

      {debts.length > 0 && (
        // Same flat shell as every other Stats card (bg-card rounded-2xl p-4, no border/shadow)
        // with the icon + uppercase muted title header the other section cards use.
        <div className="bg-card rounded-2xl p-4">
          <CardHeading icon={CreditCard} title="Debt Progress" iconClassName="text-primary" className="mb-3" />
          <DebtProgressCharts />
        </div>
      )}

      {/* ── NEW SECTIONS ── */}
      <div className="space-y-2 pt-1">
        <SectionLabel>Income</SectionLabel>
        <IncomeCard />
      </div>

      {expenses.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Expenses</SectionLabel>
          <ExpensesCard />
        </div>
      )}

      {budgetPlans.some(p => !p.archived) && (
        <div className="space-y-2">
          <SectionLabel>Budget</SectionLabel>
          <BudgetCard />
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel>Transport</SectionLabel>
        <TransportExtrasCard />
      </div>

        </TabsContent>
      </Tabs>

    </div>
  );
}
