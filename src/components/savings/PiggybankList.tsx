'use client';

import { useCallback, useContext, useMemo, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { displayProgressPct, getPayCycle } from '@/lib/calculations';
import {
  bankBalance, bankProgress, entriesOfBank, isBankFull, recurringTotal,
} from '@/lib/piggybanks';
import { LedgerRow } from '@/components/ledger/LedgerRow';
import { SwipeableRow } from '@/components/SwipeableRow';
import { FixedPortal } from '@/components/FixedPortal';
import { PiggybankDetailDialog } from '@/components/savings/PiggybankDetailDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { showUndoToast } from '@/components/ui/undo-toast';
import { useLongPress } from '@/hooks/useLongPress';
import { hapticTap, hapticTick } from '@/lib/haptics';
import type { Piggybank } from '@/lib/types';
import { Check, PiggyBank, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';

/**
 * The jars, as a list of the same cards the debts page uses.
 *
 * A piggybank is a debt read backwards — a balance climbing toward a goal instead of falling
 * toward zero — so it gets the debt card's shape exactly: LedgerRow with the animated bar,
 * swipe-to-reveal actions, press-and-hold to enter multi-select, and tap to open the detail
 * sheet. Learning the gesture once should be enough for the whole app.
 */
export function PiggybankList({ onAddTo }: {
  /** Opens the tab's add-money sheet already aimed at a jar. */
  onAddTo?: (bankId: string) => void;
}) {
  const { piggybanks, savings, recurringSavings, userProfile,
          addPiggybank, deletePiggybank, restorePiggybank } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  // Multi-select, entered by holding a card — the debts page's gesture, same rules: an
  // empty selection means the mode is off, so cancelling is just clearing it.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectMode = selected.size > 0;
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const enterSelect = useCallback((id: string) => {
    hapticTick();
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

  const banks = useMemo(() => (piggybanks ?? []), [piggybanks]);
  const openBank = banks.find(b => b.id === openId) ?? null;
  // The leftovers jar cannot be closed, so it is never part of a delete.
  const deletable = useMemo(
    () => banks.filter(b => selected.has(b.id) && !b.isLeftovers),
    [banks, selected],
  );

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Give it a name.'); return; }
    const t = target.trim() ? parseFloat(target) : undefined;
    if (t != null && (isNaN(t) || t < 0)) { setError('Enter a valid goal, or leave it blank.'); return; }
    hapticTap();
    addPiggybank(trimmed, t && t > 0 ? t : undefined);
    setName(''); setTarget(''); setError(''); setAddOpen(false);
  };

  const deleteSelected = () => {
    const removed = deletable.map(b => deletePiggybank(b.id));
    setShowBatchDelete(false);
    exitSelect();
    const n = removed.filter(r => r.bank).length;
    if (n > 0) {
      showUndoToast(
        n === 1 ? `Closed "${removed[0].bank?.name}"` : `Closed ${n} piggybanks`,
        () => removed.forEach(restorePiggybank),
      );
    }
  };

  const removeOne = (bank: Piggybank) => {
    const removed = deletePiggybank(bank.id);
    if (removed.bank) showUndoToast(`Closed "${removed.bank.name}"`, () => restorePiggybank(removed));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
          Piggybanks
        </p>
        <button
          onClick={() => { hapticTick(); setAddOpen(true); }}
          className="text-[10px] font-semibold text-accent"
        >
          + New
        </button>
      </div>

      {banks.map(bank => (
        <PiggybankCard
          key={bank.id}
          bank={bank}
          balance={bankBalance(savings ?? [], bank.id)}
          movements={entriesOfBank(savings ?? [], bank.id).length}
          perCycle={recurringTotal(recurringSavings, bank.id)}
          selectMode={selectMode}
          selected={selected.has(bank.id)}
          onSelectHold={() => enterSelect(bank.id)}
          onSelectToggle={() => toggleSelect(bank.id)}
          onOpen={() => setOpenId(bank.id)}
          onAdd={() => onAddTo?.(bank.id)}
          onDelete={() => removeOne(bank)}
        />
      ))}

      <PiggybankDetailDialog bank={openBank} onClose={() => setOpenId(null)} />

      {/* Selection bar — the debts page's floating pill, in the same place with the same
          gestures, so the mode feels like one feature rather than two lookalikes. */}
      {selectMode && (
        <FixedPortal>
          <div
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
            {deletable.length > 0 && (
              <button
                onClick={() => setShowBatchDelete(true)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-bold text-btn-on-destructive active:bg-destructive/85"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Close{deletable.length > 1 ? ` ${deletable.length}` : ''}
              </button>
            )}
          </div>
        </FixedPortal>
      )}

      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close {deletable.length === 1 ? 'this piggybank' : `${deletable.length} piggybanks`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every movement filed into {deletable.length === 1 ? 'it' : 'them'} goes too —
              {' '}{deletable.reduce((s, b) => s + entriesOfBank(savings ?? [], b.id).length, 0)} in total.
              {selected.size > deletable.length && ' The leftovers piggybank in your selection stays: the cycle-end sweep needs it.'}
              {' '}You can undo this from the toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={deleteSelected}
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── New piggybank ─────────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) { setName(''); setTarget(''); setError(''); } }}>
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
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="h-9 text-sm" autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Goal (optional)</Label>
              <Input
                type="number" inputMode="decimal" placeholder="Leave blank for no goal"
                value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                With a goal the card fills like a debt card. Without one it just shows what is in it.
              </p>
            </div>
            {error && <p className="text-[10px] text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={submit} className="w-full h-9 text-xs">Create piggybank</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kept for the cycle label in the empty case below. */}
      {banks.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          No piggybanks yet — {cycle.label} has nowhere to sweep to.
        </p>
      )}
    </div>
  );
}

/** One jar. Everything about it is derived; the card only lays it out. */
function PiggybankCard({
  bank, balance, movements, perCycle, selectMode, selected,
  onSelectHold, onSelectToggle, onOpen, onAdd, onDelete,
}: {
  bank: Piggybank;
  balance: number;
  movements: number;
  perCycle: number;
  selectMode: boolean;
  selected: boolean;
  onSelectHold: () => void;
  onSelectToggle: () => void;
  onOpen: () => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const longPress = useLongPress(onSelectHold, { enabled: !selectMode });
  const progress = bankProgress(bank, balance);
  const full = isBankFull(bank, balance);

  return (
    <div className="relative select-none" {...longPress}>
      <SwipeableRow
        rightActions={[
          { icon: Plus, label: 'Add', tone: 'accent', onAction: onAdd },
          // The leftovers jar is where every cycle-end surplus goes; without it the seal has
          // nowhere to put one, so it has no delete action at all.
          ...(bank.isLeftovers ? [] : [{ icon: Trash2, label: 'Close', tone: 'destructive' as const, onAction: onDelete }]),
        ]}
      >
        <button onClick={onOpen} className="block w-full text-left">
          <LedgerRow
            progress={progress != null ? progress * 100 : 0}
            showBar={progress != null}
            paidOff={full}
            selected={selected}
            title={bank.name}
            badge={
              <span className="flex items-center gap-1">
                {bank.isLeftovers && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-positive/15 px-2 py-0.5 text-[10px] font-semibold text-positive">
                    <Sparkles className="h-2.5 w-2.5" /> Swept
                  </span>
                )}
                {perCycle > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-snapshot/15 px-2 py-0.5 text-[10px] font-semibold text-snapshot">
                    <RotateCcw className="h-2.5 w-2.5" /> {formatCurrency(perCycle)}
                  </span>
                )}
              </span>
            }
            meta={progress != null ? `${displayProgressPct(progress * 100)}%` : undefined}
            // Same 32px slot the Receivable row uses for its marker, so the two lists line up.
            action={
              <span className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8 flex-shrink-0 pointer-events-none')}>
                <PiggyBank className="h-4 w-4" />
              </span>
            }
            footerLeft={`${formatCurrency(balance)} in`}
            footerRight={bank.target
              ? `/ ${formatCurrency(bank.target)}`
              : `${movements} ${movements === 1 ? 'movement' : 'movements'}`}
          />
        </button>
      </SwipeableRow>

      {/* Selection chrome — identical to the debt card's: the overlay owns every tap while
          selecting so the card's own controls cannot fire underneath it. */}
      {selectMode && (
        <>
          <button
            aria-label={selected ? `Deselect ${bank.name}` : `Select ${bank.name}`}
            aria-pressed={selected}
            onClick={onSelectToggle}
            className="absolute inset-0 z-20 rounded-[1rem]"
          />
          <span
            aria-hidden
            className={cn(
              'absolute -top-1.5 -right-1.5 z-30 pointer-events-none flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors duration-150',
              selected ? 'bg-primary border-primary text-btn-on-primary' : 'bg-card border-muted-foreground/40',
            )}
          >
            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        </>
      )}
    </div>
  );
}
