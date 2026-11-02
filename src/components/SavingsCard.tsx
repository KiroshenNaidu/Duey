'use client';

import { useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PiggyBank, Plus, Minus, Trash2, RefreshCw } from 'lucide-react';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent, CardHeading } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showUndoToast } from '@/components/ui/undo-toast';
import { formatCurrency, cn } from '@/lib/utils';
import type { SavingEntry } from '@/lib/types';
import type { Period } from '@/lib/cycles';

/** Newest movements shown before "Show all". */
const RECENT = 4;

const signed = (e: SavingEntry) => (e.direction === 'out' ? -e.amount : e.amount);

/**
 * Overview → Savings, for ONE cycle — the one the Deductions stepper is on (MoneyOverview
 * renders this and passes it in). The headline and the list are that cycle's movements
 * only: what was put away (a deduction on the card above) and taken back out, by the date
 * each happened. The big number is always the POT TOTAL — as it stood at the end of the
 * viewed cycle — and the cycle's own movement sits on the right of the heading. Closing a cycle moves the one-offs out of the current view, the way it
 * clears one-time expenses; a recurring deposit carries over as the new cycle's repeat,
 * which holds the "monthly" chip (see repeatRecurringSavings). Step back and a closed cycle
 * shows exactly what went in then. Nothing is deleted — the pot's all-time total sits on
 * the right of the heading, and every movement is in History.
 *
 * Only the running cycle is editable. A closed one is a record (its summary is sealed), and
 * a projected one has not happened — it shows the recurring deposits it is expected to take.
 */
export function SavingsCard({ period, viewing, onBackToCurrent }: {
  period: Period;
  viewing: 'live' | 'sealed' | 'projected';
  onBackToCurrent: () => void;
}) {
  const { savings, addSaving, deleteSaving, restoreSaving, cycleMode } = useContext(AppDataContext);
  const entries = useMemo(
    () => [...(savings ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [savings],
  );
  const total = entries.reduce((s, e) => s + signed(e), 0);

  // The viewed cycle's window — the same one the Deductions card measures savings over. A
  // cycle still to come has no movements yet; what it will take is the recurring deposits.
  const live = viewing === 'live';
  const thisCycle = useMemo(() => {
    if (viewing === 'projected') return entries.filter(e => e.recurring && e.direction !== 'out');
    return entries.filter(e => {
      const t = new Date(e.createdAt).getTime();
      return t >= period.start.getTime() && t < period.end.getTime();
    });
  }, [entries, period, viewing]);
  const cycleNet = thisCycle.reduce((s, e) => s + signed(e), 0);
  // The headline is the POT: the running total as it stood when the viewed cycle ended, so
  // it moves as you step through cycles. Now = everything; a closed cycle = everything up to
  // its end; a cycle still to come = now plus the recurring deposits it is expected to take.
  const balance = viewing === 'live'
    ? total
    : viewing === 'projected'
      ? total + cycleNet
      : entries.reduce((s, e) => (new Date(e.createdAt).getTime() < period.end.getTime() ? s + signed(e) : s), 0);
  const movement = `${cycleNet < 0 ? '−' : '+'}${formatCurrency(Math.abs(cycleNet))} ${live ? 'this month' : viewing === 'sealed' ? 'that month' : 'expected'}`;

  const [showAll, setShowAll] = useState(false);
  const [direction, setDirection] = useState<'in' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');

  const open = (dir: 'in' | 'out') => { setDirection(dir); setAmount(''); setLabel(''); setRecurring(false); setError(''); };
  const close = () => setDirection(null);

  const submit = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    // Taking out more than is in the pot would leave it negative — not a state a pot can be in.
    if (direction === 'out' && amt > total) { setError(`There is only ${formatCurrency(Math.max(0, total))} saved.`); return; }
    addSaving(amt, label.trim() || (direction === 'out' ? 'Taken out' : 'Put away'), undefined, direction ?? 'in', recurring);
    close();
  };

  const remove = (e: SavingEntry) => {
    deleteSaving(e.id);
    showUndoToast(`Removed "${e.label}"`, () => restoreSaving(e));
  };

  const shown = showAll ? thisCycle : thisCycle.slice(0, RECENT);

  return (
    <Card>
      <CardContent className="p-3">
        <CardHeading icon={PiggyBank} title="Savings" aside={movement} />
        <p className={cn('text-2xl font-bold tabular-nums', live ? 'text-foreground' : 'text-accent')}>{formatCurrency(balance)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {live
            ? 'Total saved. Putting away comes off this month’s balance; taking out puts it back.'
            : viewing === 'sealed'
              ? `Total saved at the end of ${period.label}`
              : `Expected total after ${period.label} - with recurring deposits`}
        </p>

        {live ? (
          // Same two-up action row as the rest of the app's in/out pairs.
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button size="sm" onClick={() => open('in')} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> Put away
            </Button>
            <Button size="sm" variant="outline" onClick={() => open('out')} disabled={total <= 0} className="h-8 text-xs">
              <Minus className="h-3.5 w-3.5 mr-1" /> Take out
            </Button>
          </div>
        ) : (
          <button
            onClick={onBackToCurrent}
            className="mt-2 text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
          >
            Back to this month to add or take out
          </button>
        )}

        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
            {thisCycle.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 italic">
                {live ? 'Nothing put away this month yet' : viewing === 'sealed' ? 'Nothing was put away that month' : 'No recurring deposits'}
              </p>
            )}
            {shown.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate flex items-center gap-1.5">
                    <span className="truncate">{e.label}</span>
                    {e.recurring && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/15 text-primary shrink-0">
                        <RefreshCw className="h-2 w-2" /> monthly
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(e.createdAt), 'd MMM yyyy')}</p>
                </div>
                <span className={cn(
                  'text-xs font-semibold tabular-nums min-w-0 text-right',
                  e.direction === 'out' ? 'text-muted-foreground' : 'text-[hsl(var(--positive))]',
                )}>
                  {e.direction === 'out' ? '−' : '+'}{formatCurrency(e.amount)}
                </span>
                {live && <button
                  onClick={() => remove(e)}
                  aria-label={`Remove ${e.label}`}
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>}
              </div>
            ))}
            {thisCycle.length > RECENT && (
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="text-[10px] font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  {showAll ? 'Show less' : `Show all ${thisCycle.length}`}
                </button>
              </div>
            )}
        </div>
      </CardContent>

      <Dialog open={direction !== null} onOpenChange={v => { if (!v) close(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{direction === 'out' ? 'Take out of savings' : 'Put away'}</DialogTitle>
            <DialogDescription className="sr-only">
              {direction === 'out' ? 'Record money taken out of savings.' : 'Record money put into savings.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount</label>
              <Input
                type="number" inputMode="decimal" placeholder="e.g., 500" autoFocus
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label (optional)</label>
              <Input
                placeholder={direction === 'out' ? 'e.g., car repair' : 'e.g., payday transfer'}
                value={label} onChange={e => setLabel(e.target.value)}
              />
            </div>
            {direction === 'in' && (
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-3">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-sm font-semibold text-foreground">Recurring</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {recurring
                      ? cycleMode === 'manual'
                        ? 'Added again each time you close the month, until removed'
                        : 'Added again every pay date, until removed'
                      : 'One-off, added once'}
                  </p>
                </div>
                <Switch checked={recurring} onCheckedChange={setRecurring} />
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-2">
            <Button className="w-full" onClick={submit}>{direction === 'out' ? 'Take out' : 'Put away'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
