'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { DebtCard } from '@/components/DebtCard';
import { AddDebtDialog } from '@/components/AddDebtDialog';
import { FixedPortal } from '@/components/FixedPortal';
import { Archive, Plus, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useFabLongPress, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { formatCurrency, cn } from '@/lib/utils';
import { getAmountPaid, getRemainingBalance } from '@/lib/calculations';
import { personKey, debtPersonName } from '@/lib/persons';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import { showUndoToast } from '@/components/ui/undo-toast';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';
import type { Debt, HistoryEntry } from '@/lib/types';

// Per-card multi-select wiring (see DebtCard's selection chrome). Bundled as one shape
// so DebtGroup can thread it through to its member cards untouched.
type SelectProps = {
  selectMode: boolean;
  selected: boolean;
  onSelectHold: () => void;
  onSelectToggle: () => void;
};

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

// Cluster debts owed to the SAME person into one unit — the explicit person field when set,
// else the title (legacy debts where the title IS the person) — with each unit's members
// ordered oldest→newest by creation. Units are then ordered by their own oldest member, so
// the list keeps its existing oldest-first flow and same-person debts sit together at the
// spot where the first of them was added.
function groupDebts(debts: Debt[], times: Map<string, number>): DebtUnit[] {
  const timeOf = (d: Debt) => times.get(d.id) ?? 0;
  const groups = new Map<string, Debt[]>();
  for (const d of debts) {
    const key = personKey(debtPersonName(d)) || d.id; // blank identities never merge together
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
function DebtGroup({ name, debts, selectProps }: { name: string; debts: Debt[]; selectProps: (id: string) => SelectProps }) {
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
      {debts.map(d => <DebtCard key={d.id} debt={d} grouped {...selectProps(d.id)} />)}
    </div>
  );
}

export function DebtsList() {
  const { debts, history, deleteDebt, completeDebt, restoreDebt, unarchiveDebt } = useContext(AppDataContext);
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();

  const units = useMemo(() => groupDebts(debts, creationTimes(history)), [debts, history]);

  // ── Multi-select (press & hold a card) ──────────────────────────────────────
  // Selection IS the mode: holding a card seeds the set, deselecting the last card
  // (or the X on the bar, or finishing an action) empties it and the mode ends.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectMode = selected.size > 0;
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const enterSelect = useCallback((id: string) => {
    hapticImpact(); // the "hold became something" thunk
    setSelected(new Set([id]));
  }, []);
  const toggleSelect = useCallback((id: string) => {
    hapticTick();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const exitSelect = useCallback(() => setSelected(new Set()), []);

  // Drop ids whose debts vanished (archived/deleted elsewhere) so a stale selection
  // can't hold the mode open over nothing.
  useEffect(() => {
    setSelected(prev => {
      if (prev.size === 0) return prev;
      const live = new Set(debts.map(d => d.id));
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [debts]);

  // Split the selection by payoff state — the action bar offers Archive for the fully
  // paid ones and Delete for the rest, so each card gets the action that fits it.
  // Same paid-off rule as DebtCard's gauge (paid covers the total).
  const { paidSelected, unpaidSelected } = useMemo(() => {
    const paid: string[] = [], unpaid: string[] = [];
    for (const d of debts) {
      if (!selected.has(d.id)) continue;
      const amountPaid = getAmountPaid(d, history);
      const isPaidOff = d.total_owed <= 0 ? amountPaid > 0 : amountPaid >= d.total_owed;
      (isPaidOff ? paid : unpaid).push(d.id);
    }
    return { paidSelected: paid, unpaidSelected: unpaid };
  }, [debts, history, selected]);

  // Each action consumes only its own subset and leaves the rest selected, so a mixed
  // selection can be archived and deleted in either order without re-picking cards.
  // Both capture what they remove first and offer a one-tap undo that puts it all back.
  const archiveSelected = useCallback(() => {
    hapticImpact();
    const ids = paidSelected;
    const archived = debts.filter(d => ids.includes(d.id));
    setSelected(prev => new Set([...prev].filter(id => !ids.includes(id))));
    ids.forEach(completeDebt);
    showUndoToast(
      archived.length === 1 ? `Archived "${archived[0].title}"` : `Archived ${archived.length} debts`,
      () => archived.forEach(unarchiveDebt),
    );
  }, [paidSelected, debts, completeDebt, unarchiveDebt]);

  const deleteSelected = useCallback(() => {
    hapticImpact();
    const ids = unpaidSelected;
    const removed = debts
      .filter(d => ids.includes(d.id))
      .map(d => ({ debt: d, entries: history.filter(h => h.debtId === d.id) }));
    setSelected(prev => new Set([...prev].filter(id => !ids.includes(id))));
    ids.forEach(deleteDebt);
    showUndoToast(
      removed.length === 1 ? `Deleted "${removed[0].debt.title}"` : `Deleted ${removed.length} debts`,
      () => removed.forEach(({ debt, entries }) => restoreDebt(debt, entries)),
    );
  }, [unpaidSelected, debts, history, deleteDebt, restoreDebt]);

  const selectProps = useCallback((id: string): SelectProps => ({
    selectMode,
    selected: selected.has(id),
    onSelectHold: () => enterSelect(id),
    onSelectToggle: () => toggleSelect(id),
  }), [selectMode, selected, enterSelect, toggleSelect]);

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
          ? <DebtGroup key={u.key} name={debtPersonName(u.debts[0]) || 'Untitled'} debts={u.debts} selectProps={selectProps} />
          : <DebtCard key={u.debts[0].id} debt={u.debts[0]} {...selectProps(u.debts[0].id)} />
        )
      )}

      {/* While selecting, the floating action bar takes the FAB's spot — one control at
          the bottom at a time. Both are pathname-gated: the page carousel keeps every
          page mounted, so a background DebtsList must not portal anything. */}
      {pathname === '/' && !selectMode && (
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

      {pathname === '/' && selectMode && (
        <FixedPortal>
          <div
            // w-max: a fixed element at left:50% shrink-to-fits against the right viewport
            // edge (max ~50vw) — without an explicit max-content width the button labels
            // wrap into vertical slivers ("Ar/chi"), same failure mode as the gauge readout.
            className="fixed left-1/2 -translate-x-1/2 z-40 flex w-max max-w-[calc(100vw-16px)] items-center gap-1 whitespace-nowrap rounded-full border border-border/70 bg-card/90 backdrop-blur-md py-1.5 pl-1.5 pr-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ bottom: 'calc(14px + var(--sab))' }}
          >
            <button
              aria-label="Cancel selection"
              onClick={exitSelect}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 active:bg-foreground/15"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="px-1 text-xs font-semibold tabular-nums whitespace-nowrap">
              {selected.size} selected
            </span>
            {paidSelected.length > 0 && (
              <button
                onClick={archiveSelected}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-bold text-btn-on-accent active:bg-accent/85"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive{paidSelected.length > 1 ? ` ${paidSelected.length}` : ''}
              </button>
            )}
            {unpaidSelected.length > 0 && (
              <button
                onClick={() => setShowBatchDelete(true)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-bold text-btn-on-destructive active:bg-destructive/85"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete{unpaidSelected.length > 1 ? ` ${unpaidSelected.length}` : ''}
              </button>
            )}
          </div>
        </FixedPortal>
      )}

      {/* Batch delete stays behind a confirm (deleting also removes the debts' payment
          records); archiving doesn't need one — it just moves debts into History. */}
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {unpaidSelected.length === 1 ? 'this debt' : `${unpaidSelected.length} debts`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes {unpaidSelected.length === 1 ? 'the selected debt' : 'the selected debts'} and
              {unpaidSelected.length === 1 ? ' its' : ' their'} payment records.
              {paidSelected.length > 0 && ' The fully paid debts in your selection are not touched — archive those instead.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelected} className={cn(buttonVariants({ variant: 'destructive' }))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
