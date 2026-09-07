'use client';

import { useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import {
  calculateLiveMonthly, cycleLabelFromKey, getPayCycle, listRecentCycles,
} from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showUndoToast } from '@/components/ui/undo-toast';
import { PiggyBank, Plus, Trash2, X, Sparkles } from 'lucide-react';

/**
 * Stats → Savings. A ledger of money kept, filed by pay cycle.
 *
 * The point of it is the automatic half: when a cycle ends, whatever the balance still had
 * left is swept in as a "Leftover" entry (see the seal in AppDataContext). Saving is then
 * the DEFAULT outcome of not spending, rather than something you have to remember to
 * record. Anything else — a transfer to a savings account, cash put aside — goes in by
 * hand against whichever cycle it belongs to.
 *
 * The two kinds land on Balance differently, and the asymmetry is the point:
 *   • MANUAL entries are a deduction — money you moved out is money you cannot spend, so
 *     it comes off Remaining for the cycle they are filed against.
 *   • AUTO leftovers never are. A leftover IS Remaining, already net of everything above
 *     it; deducting it as well would subtract the same money twice.
 * So a cycle's savings total reads "what I put away" + "what I had left", never one twice.
 */
export function SavingsTab() {
  const { savings, userProfile, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides,
          transportSettings, transportOverrides, transportMonthlyOverrides,
          addSaving, deleteSaving, restoreSaving } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  const cycleOptions = useMemo(() => listRecentCycles(payDay, 11), [payDay]);

  const [adding, setAdding] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [label, setLabel] = useState('');
  const [cycleKey, setCycleKey] = useState(cycle.key);
  const [error, setError] = useState('');

  const entries = savings ?? [];
  const total = entries.reduce((s, e) => s + e.amount, 0);

  // What this cycle is currently on course to bank, straight from the Balance calculator —
  // the same number the Remaining card shows, because it is the same number.
  const live = useMemo(
    () => calculateLiveMonthly({
      payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
      transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     transportSettings, transportOverrides, transportMonthlyOverrides],
  );

  // Newest cycle first; entries inside a cycle newest first. Grouping by cycle is the whole
  // filing system — "what did I keep out of that pay?" is the question this tab answers.
  const groups = useMemo(() => {
    const byCycle = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = byCycle.get(e.cycleKey);
      if (list) list.push(e); else byCycle.set(e.cycleKey, [e]);
    }
    return [...byCycle.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        label: cycleLabelFromKey(key, payDay),
        isCurrent: key === cycle.key,
        entries: [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        subtotal: list.reduce((s, e) => s + e.amount, 0),
      }));
  }, [entries, payDay, cycle.key]);

  const submit = () => {
    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    addSaving(amt, cycleKey, label.trim() || 'Savings');
    setAmountStr(''); setLabel(''); setCycleKey(cycle.key); setError(''); setAdding(false);
  };

  const remove = (id: string) => {
    const item = entries.find(e => e.id === id);
    if (!item) return;
    deleteSaving(id);
    showUndoToast(`Removed "${item.label}"`, () => restoreSaving(item));
  };

  return (
    <div className="space-y-3">
      {/* Total */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <PiggyBank className="h-4 w-4 text-[hsl(var(--positive))]" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Saved</p>
        </div>
        <p className="text-3xl font-bold text-[hsl(var(--positive))] tabular-nums leading-tight">
          {formatCurrency(total)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {entries.length === 0
            ? 'Nothing banked yet'
            : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} across ${groups.length} cycle${groups.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {/* What the live cycle is on course to add. Framed as a forecast, never as banked
          money: it only becomes an entry when the cycle actually ends with it intact. */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Cycle</p>
        </div>
        {live.remaining > 0 ? (
          <>
            <p className="text-xl font-bold text-foreground tabular-nums leading-tight">
              {formatCurrency(live.remaining)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Left over so far — banked automatically on {format(cycle.end, 'd MMM')} if it survives the cycle.
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-muted-foreground tabular-nums leading-tight">
              {formatCurrency(0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {live.remaining < 0
                ? `Over budget by ${formatCurrency(Math.abs(live.remaining))} — a cycle that ends short banks nothing.`
                : 'Nothing left over yet this cycle.'}
            </p>
          </>
        )}
      </div>

      {/* Add by hand */}
      <div className="bg-card rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Savings</p>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-foreground hover:text-foreground/70 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>

        {!adding ? (
          <p className="text-[10px] text-muted-foreground/60 italic">
            Money you put away yourself — leftovers arrive on their own.
          </p>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number" inputMode="decimal" placeholder="e.g., 1500"
                value={amountStr} onChange={e => setAmountStr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="h-9 text-sm" autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                placeholder="e.g., Emergency fund"
                value={label} onChange={e => setLabel(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cycle</Label>
              {/* Defaults to the cycle you are in — the overwhelmingly common case — with the
                  last year of cycles available for money you are recording after the fact. */}
              <Select value={cycleKey} onValueChange={setCycleKey}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cycleOptions.map(c => (
                    <SelectItem key={c.key} value={c.key} className="text-xs">
                      {c.label}{c.key === cycle.key ? ' · current' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} className="flex-1 h-8 text-xs">Add</Button>
              <Button
                size="sm" variant="ghost" className="h-8 text-xs px-2"
                onClick={() => { setAdding(false); setAmountStr(''); setLabel(''); setCycleKey(cycle.key); setError(''); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* The ledger */}
      {groups.length === 0 ? (
        <div className="bg-card rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground">No savings recorded yet.</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Whatever is left when a cycle ends lands here on its own.
          </p>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.key} className="bg-card rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {group.label}{group.isCurrent && <span className="text-accent"> · current</span>}
              </p>
              <p className="text-sm font-bold text-[hsl(var(--positive))] tabular-nums shrink-0">
                {formatCurrency(group.subtotal)}
              </p>
            </div>
            {group.entries.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{e.label}</p>
                  {/* Where it came from, rather than a badge repeating the label: an auto
                      entry is always labelled "Leftover", so a "leftover" chip beside it
                      said the same word twice. */}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {e.source === 'auto' ? 'Swept at cycle end · ' : ''}{format(new Date(e.createdAt), 'd MMM yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <p className={cn('text-sm font-semibold tabular-nums', 'text-[hsl(var(--positive))]')}>
                    +{formatCurrency(e.amount)}
                  </p>
                  <button
                    onClick={() => remove(e.id)}
                    className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Remove ${e.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
