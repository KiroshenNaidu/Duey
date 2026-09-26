'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { getPayCycle } from '@/lib/calculations';
import { bankBalance } from '@/lib/piggybanks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showUndoToast } from '@/components/ui/undo-toast';
import { hapticTap, hapticTick } from '@/lib/haptics';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

/**
 * "Other amount" for a piggybank: one screen, everything on it already filled in except
 * the number. The jar is pre-picked (it is the one whose "Other" you tapped) and shown as
 * chips so switching is one tap, not a dropdown. It always files against the cycle you are
 * in; back-dating and standing orders live in the piggybank's own sheet.
 */
export function QuickSaveSheet({ bankId, onClose }: {
  /** The jar to aim at; null closes the sheet. */
  bankId: string | null;
  onClose: () => void;
}) {
  const { piggybanks, savings, userProfile, addSaving, deleteSaving, deleteHistoryEntry } = useContext(AppDataContext);
  const banks = useMemo(() => piggybanks ?? [], [piggybanks]);
  const cycle = useMemo(() => getPayCycle(userProfile.paydayDay), [userProfile.paydayDay]);

  const [target, setTarget] = useState<string>('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  // Each opening starts clean and aimed at the jar that was tapped.
  useEffect(() => {
    if (!bankId) return;
    setTarget(bankId); setDirection('in'); setAmount(''); setLabel(''); setError('');
  }, [bankId]);

  const bank = banks.find(b => b.id === target);
  const balance = bank ? bankBalance(savings ?? [], bank.id) : 0;

  const submit = () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!bank) { setError('Pick a piggybank.'); return; }
    if (isNaN(amt) || amt <= 0) { setError('Type an amount above zero.'); return; }
    // Taking out more than is in there is almost always a typo, and would leave the jar
    // negative for every figure downstream to explain.
    if (direction === 'out' && amt > balance) { setError(`Only ${formatCurrency(balance)} in ${bank.name}.`); return; }
    hapticTap();
    const made = addSaving(
      amt, cycle.key, label.trim() || (direction === 'out' ? 'Taken out' : 'Put away'), undefined, bank.id, direction,
    );
    showUndoToast(
      direction === 'out'
        ? `Took ${formatCurrency(amt)} out of ${bank.name}`
        : `Put ${formatCurrency(amt)} in ${bank.name}`,
      () => { deleteSaving(made.id); deleteHistoryEntry(made.historyId); },
    );
    onClose();
  };

  return (
    <Dialog open={!!bankId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{direction === 'out' ? 'Take money out' : 'Put money in'}</DialogTitle>
          <DialogDescription>
            {direction === 'out'
              ? 'Goes back onto this cycle’s balance, so you can spend it again.'
              : 'Comes off this cycle’s balance and sits in the piggybank.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-1.5">
            {([['in', 'Put in', ArrowDownLeft], ['out', 'Take out', ArrowUpRight]] as const).map(([dir, text, Icon]) => (
              <button
                key={dir}
                onClick={() => { hapticTick(); setDirection(dir); setError(''); }}
                disabled={dir === 'out' && balance <= 0}
                className={cn(
                  'flex-1 h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors disabled:opacity-40',
                  direction === dir ? 'bg-accent text-btn-on-accent' : 'bg-muted/40 text-muted-foreground active:bg-muted/70',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {text}
              </button>
            ))}
          </div>

          <Input
            type="number" inputMode="decimal" placeholder="Amount"
            value={amount} onChange={e => { setAmount(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="h-12 text-lg font-semibold" autoFocus
          />

          {/* Jars as chips: every option visible at once, one tap to switch. */}
          <div className="flex flex-wrap gap-1.5">
            {banks.map(b => (
              <button
                key={b.id}
                onClick={() => { hapticTick(); setTarget(b.id); setError(''); }}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-semibold transition-colors',
                  target === b.id ? 'bg-primary text-btn-on-primary' : 'bg-muted/40 text-muted-foreground active:bg-muted/70',
                )}
              >
                {b.name}
              </button>
            ))}
          </div>

          <Input
            placeholder="Note (optional)"
            value={label} onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="h-9 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={submit} className="w-full h-10 text-sm">
            {direction === 'out' ? 'Take out' : 'Put in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
