'use client';

import { useContext, useMemo, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, formatCurrencyShort } from '@/lib/utils';
import { displayProgressPct, getPayCycle } from '@/lib/calculations';
import { bankBalance, bankProgress, isBankFull, recurringTotal } from '@/lib/piggybanks';
import type { CardSize } from '@/lib/cardLayout';
import { PiggybankDetailDialog } from '@/components/savings/PiggybankDetailDialog';
import { QuickSaveSheet } from '@/components/savings/QuickSaveSheet';
import { CardHeading } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { showUndoToast } from '@/components/ui/undo-toast';
import { hapticTap, hapticTick } from '@/lib/haptics';
import type { Piggybank } from '@/lib/types';
import { ChevronRight, PiggyBank, Plus, RotateCcw, Sparkles } from 'lucide-react';

/** The one-tap amounts under every jar. "Other" covers everything else. */
const QUICK_AMOUNTS = [50, 100, 200];

/**
 * Every piggybank, each with its own add buttons: one tap on "+R100" puts R100 in that jar
 * (with Undo on the toast in case the tap was a slip), "Other" opens a one-screen sheet for
 * any amount or to take money out. Tapping a jar's name opens its full sheet — history,
 * standing orders, rename and goal.
 *
 * Money put in by hand comes off this cycle's Balance, because it is money moved out of
 * reach — Balance lists it as its own "Savings (put away)" line, so the drop is explained.
 *
 * Sizes: 2×1 is the compact list; 2×2 adds each jar's goal bar and details.
 */
export function PiggybanksCard({ size }: { size: CardSize }) {
  const { piggybanks, savings, recurringSavings, userProfile, addSaving, addPiggybank,
          deleteSaving, deleteHistoryEntry } = useContext(AppDataContext);
  const cycle = useMemo(() => getPayCycle(userProfile.paydayDay), [userProfile.paydayDay]);
  const banks = useMemo(() => piggybanks ?? [], [piggybanks]);
  const detailed = size === 'large';

  const [openId, setOpenId] = useState<string | null>(null);
  const [quickFor, setQuickFor] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  const quickAdd = (bank: Piggybank, amount: number) => {
    hapticTap();
    const made = addSaving(amount, cycle.key, 'Put away', undefined, bank.id, 'in');
    showUndoToast(
      `Put ${formatCurrencyShort(amount)} in ${bank.name}`,
      () => { deleteSaving(made.id); deleteHistoryEntry(made.historyId); },
    );
  };

  const createBank = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Give it a name.'); return; }
    const t = target.trim() ? parseFloat(target) : undefined;
    if (t != null && (isNaN(t) || t < 0)) { setError('Enter a valid goal, or leave it blank.'); return; }
    hapticTap();
    addPiggybank(trimmed, t && t > 0 ? t : undefined);
    closeNew();
  };
  const closeNew = () => { setNewOpen(false); setName(''); setTarget(''); setError(''); };

  return (
    <div className="bg-card rounded-2xl p-4 h-full">
      <CardHeading icon={PiggyBank} title="Piggybanks" iconClassName="text-[hsl(var(--positive))]" />

      <div className="space-y-2.5">
        {banks.map(bank => {
          const balance = bankBalance(savings ?? [], bank.id);
          const progress = bankProgress(bank, balance);
          const perCycle = recurringTotal(recurringSavings, bank.id);
          return (
            <div key={bank.id} className="rounded-xl bg-muted/30 p-3">
              <button
                onClick={() => { hapticTick(); setOpenId(bank.id); }}
                className="flex w-full items-center gap-2 text-left"
                aria-label={`Open ${bank.name}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{bank.name}</span>
                    {detailed && bank.isLeftovers && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-positive/15 px-1.5 py-0.5 text-[9px] font-semibold text-positive">
                        <Sparkles className="h-2.5 w-2.5" /> Auto
                      </span>
                    )}
                    {detailed && perCycle > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-snapshot/15 px-1.5 py-0.5 text-[9px] font-semibold text-snapshot">
                        <RotateCcw className="h-2.5 w-2.5" /> {formatCurrencyShort(perCycle)}
                      </span>
                    )}
                  </span>
                  {detailed && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {bank.isLeftovers
                        ? 'Leftover Balance lands here when each cycle ends'
                        : bank.target
                          ? `${formatCurrency(Math.max(0, bank.target - balance))} to go of ${formatCurrency(bank.target)}`
                          : 'No goal set'}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-[hsl(var(--positive))]">
                  {formatCurrency(balance)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </button>

              {detailed && progress != null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${progress * 100}%`,
                        background: isBankFull(bank, balance) ? 'hsl(var(--primary-complete))' : 'hsl(var(--positive))',
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {displayProgressPct(progress * 100)}%
                  </span>
                </div>
              )}

              {/* The point of the card: add without opening anything. */}
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {QUICK_AMOUNTS.map(a => (
                  <button
                    key={a}
                    onClick={() => quickAdd(bank, a)}
                    className="h-9 rounded-lg bg-accent/15 text-xs font-bold tabular-nums text-accent active:bg-accent/30"
                    aria-label={`Put ${formatCurrency(a)} in ${bank.name}`}
                  >
                    +{formatCurrencyShort(a)}
                  </button>
                ))}
                <button
                  onClick={() => { hapticTick(); setQuickFor(bank.id); }}
                  className="h-9 rounded-lg bg-muted/60 text-xs font-semibold text-foreground active:bg-muted"
                  aria-label={`Other amount for ${bank.name}`}
                >
                  Other
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => { hapticTick(); setNewOpen(true); }}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/30 text-xs font-semibold text-muted-foreground active:bg-muted/40"
      >
        <Plus className="h-4 w-4" /> New piggybank
      </button>

      <PiggybankDetailDialog bank={banks.find(b => b.id === openId) ?? null} onClose={() => setOpenId(null)} />
      <QuickSaveSheet bankId={quickFor} onClose={() => setQuickFor(null)} />

      <Dialog open={newOpen} onOpenChange={o => { if (!o) closeNew(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New piggybank</DialogTitle>
            <DialogDescription>A jar to keep money in. Give it a goal if it is for something.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="e.g., Emergency fund"
                value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createBank()}
                className="h-9 text-sm" autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Goal (optional)</Label>
              <Input
                type="number" inputMode="decimal" placeholder="Leave blank for no goal"
                value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createBank()}
                className="h-9 text-sm"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={createBank} className="w-full h-9 text-xs">Create piggybank</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
