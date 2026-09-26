'use client';

import { useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { calculateLiveMonthly, cycleLabelFromKey, getPayCycle } from '@/lib/calculations';
import { bankIdOf, savingsTotal, signedAmount } from '@/lib/piggybanks';
import { CardGrid, type GridCard } from '@/components/cards/CardGrid';
import { CardHeading } from '@/components/ui/card';
import { SavingsTrendCard } from '@/components/stats/CycleCharts';
import { LegendDot } from '@/components/stats/StatPrimitives';
import { PiggybanksCard } from '@/components/savings/PiggybanksCard';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import { showUndoToast } from '@/components/ui/undo-toast';
import type { SavingEntry } from '@/lib/types';
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, History, PiggyBank, RotateCcw, Sparkles, Trash2,
  TrendingUp, Trophy,
} from 'lucide-react';

/**
 * Stats → Savings. How much is put away, what this cycle is about to add, and the jars.
 *
 * Saving happens two ways:
 *   • On its own — when a pay cycle ends, whatever Balance has left is swept into the
 *     Leftovers piggybank (rollOverCycles in AppDataContext). Nothing to remember.
 *   • By hand — the add buttons under each piggybank. Money put in by hand comes off this
 *     cycle's Balance (it is out of reach now); money taken out goes back onto it. The
 *     automatic leftover never touches Balance: it IS what Balance had left.
 *
 * The page is a card grid (components/cards/CardGrid): hold any card to move, resize or
 * hide it. It opens with the four cards that answer the everyday questions; the charts and
 * extra figures wait in "Add card".
 */

// The two ways money arrives, in the colours the trend chart and the jars use.
const AUTO_COLOR = 'hsl(var(--positive))';       // left over, swept at cycle end
const MANUAL_COLOR = 'hsl(var(--cat-snapshot))'; // put away by hand

export function SavingsTab() {
  const { savings, piggybanks, recurringSavings, loans, userProfile, monthlyIncome, extraIncomes,
          expenses, budgetPlans, history, uberRides,
          transportSettings, transportOverrides, transportMonthlyOverrides,
          deleteSaving, restoreSaving } = useContext(AppDataContext);

  const pathname = usePathname();
  const payDay = userProfile.paydayDay;
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  const banks = useMemo(() => piggybanks ?? [], [piggybanks]);
  const entries = useMemo(() => savings ?? [], [savings]);
  const ready = useReplayOnActive('/stats');

  const total = savingsTotal(entries);
  const autoTotal = entries.filter(e => e.source === 'auto' && e.direction !== 'out').reduce((s, e) => s + e.amount, 0);
  const putAwayTotal = entries.filter(e => e.source !== 'auto' && e.direction !== 'out').reduce((s, e) => s + e.amount, 0);

  // What this cycle is on course to bank — the Balance tab's Remaining, from the same
  // calculator, so the two can never show different numbers.
  const live = useMemo(
    () => calculateLiveMonthly({
      payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
      recurringSavings, loans, transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     recurringSavings, loans, transportSettings, transportOverrides, transportMonthlyOverrides],
  );

  // Net saved per cycle, oldest first — feeds the trend line and the average/best tiles.
  const perCycle = useMemo(() => {
    const byCycle = new Map<string, { manual: number; auto: number }>();
    for (const e of entries) {
      const row = byCycle.get(e.cycleKey) ?? { manual: 0, auto: 0 };
      if (e.source === 'auto') row.auto += signedAmount(e); else row.manual += signedAmount(e);
      byCycle.set(e.cycleKey, row);
    }
    return [...byCycle.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, v]) => ({ key, ...v, total: v.manual + v.auto }));
  }, [entries]);
  const best = perCycle.reduce<(typeof perCycle)[number] | null>((b, c) => (!b || c.total > b.total ? c : b), null);

  const recent = useMemo(
    () => [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [entries],
  );
  const bankName = (e: SavingEntry) => banks.find(b => b.id === bankIdOf(e))?.name ?? 'Savings';
  const remove = (e: SavingEntry) => {
    deleteSaving(e.id);
    showUndoToast(`Removed "${e.label}"`, () => restoreSaving(e));
  };

  const cards: GridCard[] = [
    {
      id: 'total',
      title: 'Total saved',
      icon: PiggyBank,
      sizes: ['small', 'wide'],
      defaultSize: 'small',
      render: size => (
        <div className="bg-card rounded-2xl p-4 h-full">
          <CardHeading icon={PiggyBank} title="Total saved" iconClassName="text-[hsl(var(--positive))]" />
          <p className={cn('font-bold text-[hsl(var(--positive))] tabular-nums truncate', size === 'small' ? 'text-xl' : 'text-3xl')}>
            {formatCurrency(total)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {entries.length === 0
              ? 'Nothing banked yet'
              : `in ${banks.length} ${banks.length === 1 ? 'piggybank' : 'piggybanks'}`}
          </p>
          {/* Wide: where it came from — left over on its own vs put away by hand. */}
          {size !== 'small' && autoTotal + putAwayTotal > 0 && (
            <>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary mt-3">
                {([{ value: autoTotal, color: AUTO_COLOR }, { value: putAwayTotal, color: MANUAL_COLOR }]).map(part => part.value > 0 && (
                  <div
                    key={part.color}
                    className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
                    style={{ width: `${ready ? (part.value / (autoTotal + putAwayTotal)) * 100 : 0}%`, background: part.color }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2">
                <LegendDot color={AUTO_COLOR} label="Left over" value={formatCurrency(autoTotal)} />
                <LegendDot color={MANUAL_COLOR} label="Put away" value={formatCurrency(putAwayTotal)} />
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      id: 'cycle',
      title: 'This cycle',
      icon: Sparkles,
      sizes: ['small', 'wide'],
      defaultSize: 'small',
      render: size => (
        <div className="bg-card rounded-2xl p-4 h-full">
          <CardHeading
            icon={Sparkles}
            title="This cycle"
            aside={size === 'small' ? undefined : `${cycle.daysLeft} day${cycle.daysLeft === 1 ? '' : 's'} left`}
          />
          <p className={cn(
            'font-bold tabular-nums truncate',
            size === 'small' ? 'text-xl' : 'text-2xl',
            live.remaining > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}>
            {formatCurrency(Math.max(0, live.remaining))}
          </p>
          <div className="h-1 w-full rounded-full bg-secondary overflow-hidden mt-2">
            <div
              className={cn('h-full rounded-full', ready && 'transition-[width] duration-700')}
              style={{ width: `${ready ? cycle.progress * 100 : 0}%`, background: 'hsl(var(--accent))' }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {live.remaining < 0
              ? `Over by ${formatCurrency(Math.abs(live.remaining))}`
              : size === 'small'
                ? `Saves itself ${format(cycle.end, 'd MMM')}`
                : live.remaining > 0
                  ? `What Balance has left. On ${format(cycle.end, 'd MMM')} whatever is still there moves into Leftovers on its own.`
                  : 'Nothing left over yet this cycle.'}
          </p>
        </div>
      ),
    },
    {
      id: 'piggybanks',
      title: 'Piggybanks',
      icon: PiggyBank,
      sizes: ['wide', 'large'],
      defaultSize: 'wide',
      render: size => <PiggybanksCard size={size} />,
    },
    {
      id: 'recent',
      title: 'Recent activity',
      icon: History,
      sizes: ['wide', 'large'],
      defaultSize: 'wide',
      render: size => <RecentCard entries={recent} limit={size === 'large' ? 10 : 4} bankName={bankName} payDay={payDay} onRemove={remove} />,
    },
    {
      id: 'trend',
      title: 'Saved per cycle',
      icon: BarChart3,
      sizes: ['wide'],
      defaultSize: 'wide',
      defaultHidden: true,
      available: perCycle.length >= 2,
      emptyHint: 'Shows up once two pay cycles have savings in them.',
      render: () => <SavingsTrendCard cycles={perCycle} payDay={payDay} ready={ready} />,
    },
    {
      id: 'average',
      title: 'Average per cycle',
      icon: TrendingUp,
      sizes: ['small'],
      defaultSize: 'small',
      defaultHidden: true,
      available: perCycle.length >= 1,
      emptyHint: 'Needs at least one cycle with savings.',
      render: () => (
        <Tile icon={TrendingUp} label="Average / cycle" value={formatCurrency(perCycle.length ? total / perCycle.length : 0)} sub={`over ${perCycle.length} cycle${perCycle.length === 1 ? '' : 's'}`} />
      ),
    },
    {
      id: 'best',
      title: 'Best cycle',
      icon: Trophy,
      sizes: ['small'],
      defaultSize: 'small',
      defaultHidden: true,
      available: !!best,
      emptyHint: 'Needs at least one cycle with savings.',
      render: () => best && (
        <Tile icon={Trophy} label="Best cycle" value={formatCurrency(best.total)} sub={cycleLabelFromKey(best.key, payDay)} />
      ),
    },
  ];

  return (
    <div>
      <CardGrid pageId="savings" cards={cards} active={pathname === '/stats'} />
      <p className="mt-4 text-center text-[10px] text-muted-foreground/60">
        Tip: hold any card to move, resize or hide it.
      </p>
    </div>
  );
}

/** A 1×1 figure tile. */
function Tile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <Icon className="h-4 w-4 text-accent" />
      <p className="mt-2 text-lg font-bold tabular-nums text-foreground truncate">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 truncate">{sub}</p>}
    </div>
  );
}

/** The latest movements across every jar, newest first. Delete has Undo. */
function RecentCard({ entries, limit, bankName, payDay, onRemove }: {
  entries: SavingEntry[];
  limit: number;
  bankName: (e: SavingEntry) => string;
  payDay: number;
  onRemove: (e: SavingEntry) => void;
}) {
  const shown = entries.slice(0, limit);
  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading icon={History} title="Recent activity" aside={entries.length > limit ? `${limit} of ${entries.length}` : undefined} />
      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Nothing yet. When this cycle ends, whatever is left lands in Leftovers on its own -
          or tap one of the + buttons on a piggybank to put money away now.
        </p>
      ) : (
        <div className="space-y-1.5">
          {shown.map(e => {
            const out = e.direction === 'out';
            const auto = e.source === 'auto';
            const Icon = out ? ArrowUpRight : auto ? Sparkles : e.source === 'recurring' ? RotateCcw : ArrowDownLeft;
            return (
              <div key={e.id} className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', out ? 'text-[hsl(var(--negative))]' : 'text-[hsl(var(--positive))]')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{bankName(e)}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {auto ? 'Left over' : e.label} · {cycleLabelFromKey(e.cycleKey, payDay)}
                  </p>
                </div>
                <span className={cn(
                  'text-xs font-bold tabular-nums shrink-0',
                  out ? 'text-[hsl(var(--negative))]' : 'text-[hsl(var(--positive))]',
                )}>
                  {out ? '−' : '+'}{formatCurrency(e.amount)}
                </span>
                <button
                  onClick={() => onRemove(e)}
                  className="p-1.5 -mr-1 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                  aria-label={`Remove ${e.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
