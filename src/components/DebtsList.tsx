'use client';

import { useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { DebtCard } from '@/components/DebtCard';
import { AddDebtDialog } from '@/components/AddDebtDialog';
import { FixedPortal } from '@/components/FixedPortal';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFabLongPress, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { formatCurrency, cn } from '@/lib/utils';
import { getRemainingBalance } from '@/lib/calculations';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import type { Debt, HistoryEntry } from '@/lib/types';

// A debt has no timestamp of its own — its creation instant lives on the one-time 'creation'
// history entry written when it was added. This map powers both the within-group ordering and
// the per-card "Added …" date stamp. Missing entries (e.g. hand-imported debts) sort as 0.
function creationTimes(history: HistoryEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of history) {
    if (h.type === 'creation' && h.debtId) m.set(h.debtId, new Date(h.date).getTime());
  }
  return m;
}

type DebtUnit = { key: string; debts: Debt[]; sortTime: number };

// Cluster debts owed to the SAME person/label (title, case-insensitive) into one unit, with
// each unit's members ordered oldest→newest by creation. Units are then ordered by their own
// oldest member, so the list keeps its existing oldest-first flow and same-name debts sit
// together at the spot where the first of them was added.
function groupDebts(debts: Debt[], times: Map<string, number>): DebtUnit[] {
  const timeOf = (d: Debt) => times.get(d.id) ?? 0;
  const groups = new Map<string, Debt[]>();
  for (const d of debts) {
    const key = d.title.trim().toLowerCase() || d.id; // blank titles never merge together
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }
  const units: DebtUnit[] = [];
  for (const [key, ds] of groups) {
    const ordered = [...ds].sort((a, b) => timeOf(a) - timeOf(b));
    units.push({ key, debts: ordered, sortTime: timeOf(ordered[0]) });
  }
  return units.sort((a, b) => a.sortTime - b.sortTime);
}

// The "card behind them": a recessed tray holding every debt to one person, name shown once
// up top with a running total, the member cards stacked beneath in creation order.
function DebtGroup({ name, debts }: { name: string; debts: Debt[] }) {
  const { history } = useContext(AppDataContext);
  const { totalOwed, remaining, progress, allPaid } = useMemo(() => {
    const totalOwed = debts.reduce((s, d) => s + d.total_owed, 0);
    // Per-debt remaining, each already clamped at 0 — summing raw paid across the group
    // would let one member's overpayment silently cancel another's outstanding balance.
    const remaining = debts.reduce((s, d) => s + getRemainingBalance(d, history), 0);
    const progress = totalOwed > 0 ? Math.min(100, ((totalOwed - remaining) / totalOwed) * 100) : 0;
    return { totalOwed, remaining, progress, allPaid: remaining <= 0 && totalOwed > 0 };
  }, [debts, history]);

  // Mirror the per-card fill: replay the bar every time the Money page becomes active.
  const barReady = useReplayOnActive('/');

  return (
    <div className="rounded-[1rem] border border-border/60 bg-card/40 p-2 shadow-sm space-y-2">
      <div className="px-3 pt-2.5 pb-1 space-y-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-base ring-1 ring-inset ring-primary/25">
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-bold text-sm truncate">{name}</p>
              <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {debts.length} debts
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {allPaid
                ? <span className="text-primary font-medium">All settled · {formatCurrency(totalOwed)}</span>
                : <><span className="font-medium text-foreground/80">{formatCurrency(remaining)}</span> left of {formatCurrency(totalOwed)}</>}
            </p>
          </div>
          <span
            className="flex-shrink-0 text-sm font-bold tabular-nums text-primary"
            style={allPaid ? { color: 'hsl(var(--primary-complete))' } : undefined}
          >
            {Math.round(progress)}%
          </span>
        </div>

        {/* Group-level payoff bar — same flowing gradient as the member cards */}
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full bar-animated', barReady && 'transition-[width] duration-700', allPaid && 'bar-glow')}
            style={{
              width: `${barReady ? progress : 0}%`,
              background: allPaid
                ? 'repeating-linear-gradient(to right, hsl(var(--primary-b)) 0%, hsl(var(--primary-complete)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary-complete)) 75%, hsl(var(--primary-b)) 100%)'
                : 'repeating-linear-gradient(to right, hsl(var(--primary-a)) 0%, hsl(var(--primary)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary)) 75%, hsl(var(--primary-a)) 100%)',
            }}
          />
        </div>
      </div>
      {debts.map(d => <DebtCard key={d.id} debt={d} grouped />)}
    </div>
  );
}

export function DebtsList() {
  const { debts, history } = useContext(AppDataContext);
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();

  const units = useMemo(() => groupDebts(debts, creationTimes(history)), [debts, history]);

  return (
    <div className="space-y-3">
      {debts.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-base">Stop acting like you didn&apos;t forget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No debts tracked yet.</p>
            <p className="text-xs text-muted-foreground">Tap the + button to add one.</p>
          </CardContent>
        </Card>
      ) : (
        units.map(u => u.debts.length >= 2
          ? <DebtGroup key={u.key} name={u.debts[0].title.trim() || 'Untitled'} debts={u.debts} />
          : <DebtCard key={u.debts[0].id} debt={u.debts[0]} />
        )
      )}

      {pathname === '/' && (
        <FixedPortal>
          <AddDebtDialog>
            <button
              aria-label="Add new debt"
              className="fab-blurable fixed left-1/2 -translate-x-1/2 h-12 w-12 rounded-full focus:outline-none transition-transform hover:scale-105 z-40"
              style={{ bottom: 'calc(10px + var(--sab))', ...FAB_TOUCH_STYLE }}
              {...fabLongPress}
            >
              <FabPulse><Plus className="h-5 w-5" /></FabPulse>
            </button>
          </AddDebtDialog>
        </FixedPortal>
      )}
    </div>
  );
}
