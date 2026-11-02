'use client';

import { useCallback, useContext, useMemo, useState } from 'react';
import { add, format, startOfDay } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Car } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { DebtProgressCharts } from '@/components/DebtProgressCharts';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import { CardHeading } from '@/components/ui/card';
import {
  calculateGlobalStats, calculateSealedCycleSummary, calculateTransportRange, dayKey,
  displayProgressPct, type MonthlyMoney, type MoneyWindow,
} from '@/lib/calculations';
import { buildTimeline } from '@/lib/cycles';
import {
  CycleNavigatorCard, SpendBreakdownCard, sumMonthlyMoney,
  type CyclePoint, type CycleSelection,
} from '@/components/stats/CycleCharts';

/**
 * Money → Stats. Purely statistics: how money came in and went out, month by month, plus
 * how the debts are coming down. Nothing here is edited — that happens on the other tabs
 * and on Overview.
 *
 * The unit is the CALENDAR MONTH, stepped with the arrows (a custom range is one tap on the
 * label). Every month is worked out the same way, from what is dated inside it — payments,
 * rides, the transport calendar, expenses and budget confirmations — rather than from cycle
 * summaries, which now end whenever the user closes a cycle and so no longer line up with
 * months. The current month counts up to today.
 *
 * Built on the cycle navigator: a timeline with a pay day of 1 IS calendar months, so the
 * same stepping, range picker and spend line serve here unchanged.
 */

const ROUTE = '/';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">{children}</p>;
}

// ─── In / Out / Net ─────────────────────────────────────────────────────────────

function Figure({ label, value, color, icon: Icon }: {
  label: string; value: number; color: string; icon?: React.ElementType;
}) {
  // A long range adds up to seven figures, which does not fit a third of the row at
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

function SummaryCard({ money, live, span }: { money: MonthlyMoney; live: boolean; span: number }) {
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
      {(span > 1 || live) && (
        <div className="mt-3 pt-2.5 border-t border-border/30 space-y-1">
          {span > 1 && (
            <p className="text-[10px] text-muted-foreground/60">
              Totals across {span} months · {formatCurrency(money.totalOutgoings / span)} out per month on average.
            </p>
          )}
          {live && (
            <p className="text-[10px] text-muted-foreground/60">This month counts up to today.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Transport ──────────────────────────────────────────────────────────────────

function TransportDetailCard({ start, end, money }: { start: Date; end: Date; money: MonthlyMoney }) {
  const { transportOverrides, transportSettings, transportMonthlyOverrides, uberRides } = useContext(AppDataContext);
  // Days from the calendar over the whole span; the cost is the months' own figures summed,
  // because a flat monthly fee is charged once per month, not once per span.
  const days = calculateTransportRange(start, end, transportOverrides, transportSettings, transportMonthlyOverrides);
  const startKey = dayKey(start);
  const endKey = dayKey(end);
  const rides = uberRides.filter(r => r.date >= startKey && r.date < endKey).length;

  return (
    <div className="bg-card rounded-2xl p-4">
      <CardHeading icon={Car} title="Transport" iconClassName="text-[hsl(var(--cat-transport))]" />
      <div className="space-y-2">
        <Row
          label="Days travelled"
          value={String(days.travelDaysCount)}
          sub={days.halfDaysCount > 0 ? `${days.halfDaysCount} half day${days.halfDaysCount === 1 ? '' : 's'}` : undefined}
        />
        <Row label="Driver cost" value={formatCurrency(money.transport)} />
        <Row label="Uber rides" value={formatCurrency(money.uber)} sub={`${rides} ride${rides === 1 ? '' : 's'}`} />
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
      </div>
      <p className="text-sm font-semibold tabular-nums text-foreground min-w-0 text-right">{value}</p>
    </div>
  );
}

// ─── Debts ──────────────────────────────────────────────────────────────────────

const DONUT_RADIUS = 38;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

function DebtHeroCard() {
  const { debts, history } = useContext(AppDataContext);
  const stats = useMemo(() => calculateGlobalStats(debts, history), [debts, history]);

  // Credited (per-debt clamped) paid, so the ring and the % agree with the per-debt bars
  // below instead of being inflated by an overpayment on one debt.
  const progress = stats.globalTotalDebt > 0 ? stats.globalCreditedPaid / stats.globalTotalDebt : 0;
  const pct = displayProgressPct(progress * 100);
  const offset = DONUT_CIRC * (1 - Math.min(progress, 1));

  // Re-runs the ring-fill every time the Money page becomes active — the carousel keeps
  // it permanently mounted, so a mount effect would only animate once.
  const ready = useReplayOnActive(ROUTE);

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
            // Transition only while filling, so the reset to empty on re-entry is instant.
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

// ─── The tab ────────────────────────────────────────────────────────────────────

export function StatsTab() {
  const {
    monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, debts, savings,
    transportSettings, transportOverrides, transportMonthlyOverrides,
  } = useContext(AppDataContext);

  // Calendar months: a pay-date timeline with a pay day of 1. Rebuilt when the day turns
  // over, since the current month is measured up to today.
  const today = dayKey(new Date());
  const months = useMemo(
    () => buildTimeline({ mode: 'auto', payDay: 1, manualCycleStart: '', manualCycleKey: '', history }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` re-derives on day rollover
    [history, today],
  );
  const current = months.current;
  const tomorrow = add(startOfDay(new Date()), { days: 1 });

  const input = useMemo(
    () => ({
      payDay: 1, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides,
      transportSettings, transportOverrides, transportMonthlyOverrides, savings,
    }),
    [monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides,
     transportSettings, transportOverrides, transportMonthlyOverrides, savings],
  );

  // One month's money, from what is dated inside it. The current month stops at today:
  // stats are a record, and travel days still to come haven't happened.
  const windowOf = useCallback((key: string): MoneyWindow => {
    const p = months.period(key);
    return { start: p.start, end: key === current.key ? tomorrow : p.end, key };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tomorrow follows `today`
  }, [months, current.key, today]);
  const readMonth = useCallback((key: string) => {
    const money = calculateSealedCycleSummary(input, key, windowOf(key));
    // A month before you had any data still derives an income from today's salary, so
    // "has income" proves nothing — only spending (or being this month) makes it real.
    return { money, recorded: key === current.key || money.totalOutgoings > 0 };
  }, [input, windowOf, current.key]);

  // The selection is a span of month keys; both ends the same is a single month, which is
  // what the arrows and the chart produce. null follows the current month.
  const [picked, setPicked] = useState<{ fromKey: string; toKey: string } | null>(null);
  const fromKey = picked?.fromKey ?? current.key;
  const toKey = picked?.toKey ?? current.key;

  const selected: CycleSelection = useMemo(() => {
    const keys = months.keysBetween(fromKey, toKey);
    const read = keys.map(readMonth);
    const first = months.period(keys[0]);
    const last = months.period(keys[keys.length - 1]);
    const sameYear = first.start.getFullYear() === last.lastDay.getFullYear();
    return {
      fromKey: keys[0],
      toKey: keys[keys.length - 1],
      keys,
      label: keys.length === 1
        ? first.label
        : `${format(first.start, sameYear ? 'MMM' : 'MMM yyyy')} – ${format(last.start, 'MMM yyyy')}`,
      live: keys.includes(current.key),
      recorded: read.some(r => r.recorded),
      money: keys.length === 1 ? read[0].money : sumMonthlyMoney(read.map(r => r.money)),
    };
  }, [fromKey, toKey, months, readMonth, current.key]);

  // Every month the spend line could draw: from the oldest with any data (or the start of
  // the selection, if that reaches further back) up to this one.
  const points: CyclePoint[] = useMemo(() => {
    const earliest = fromKey < months.earliestKey ? fromKey : months.earliestKey;
    return months.keysBetween(earliest, current.key).map(key => {
      const { money, recorded } = readMonth(key);
      return { key, label: months.period(key).label, live: key === current.key, recorded, money };
    });
  }, [months, fromKey, current.key, readMonth]);

  const ready = useReplayOnActive(ROUTE);
  const spanStart = months.period(selected.fromKey).start;
  const spanEnd = windowOf(selected.toKey).end;

  return (
    <div className="space-y-3">
      <CycleNavigatorCard
        selected={selected}
        points={points}
        liveKey={current.key}
        timeline={months}
        onSelectRange={(a, b) => setPicked(a === current.key && b === current.key ? null : { fromKey: a, toKey: b })}
        ready={ready}
      />
      <SummaryCard money={selected.money} live={selected.live} span={selected.keys.length} />
      <SpendBreakdownCard money={selected.money} ready={ready} />
      <TransportDetailCard start={spanStart} end={spanEnd} money={selected.money} />

      {debts.length > 0 && (
        <div>
          <SectionLabel>Debts</SectionLabel>
          <div className="space-y-3">
            <DebtHeroCard />
            <DebtProgressCharts />
          </div>
        </div>
      )}
    </div>
  );
}
