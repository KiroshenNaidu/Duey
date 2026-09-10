'use client';

import { useContext, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import {
  isLoanOverdue, isLoanSettled, loanEventsNewestFirst, loanLastActivity, loanLent,
  loanOutstanding, loanProgress, loanRepaid,
} from '@/lib/loans';
import { derivePersonProfiles, personKey } from '@/lib/persons';
import { displayProgressPct } from '@/lib/calculations';
import { LedgerRow } from '@/components/ledger/LedgerRow';
import { LedgerDetailContent } from '@/components/ledger/LedgerDetailContent';
import { DebtSemiGauge } from '@/components/DebtSemiGauge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/DatePicker';
import { SwipeableRow } from '@/components/SwipeableRow';
import { FixedPortal } from '@/components/FixedPortal';
import { useFabLongPress, usePageFab, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { showUndoToast } from '@/components/ui/undo-toast';
import { hapticTap, hapticTick } from '@/lib/haptics';
import type { Loan, LoanEvent } from '@/lib/types';
import {
  Plus, Trash2, HandCoins, ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown,
  CalendarClock, RotateCcw,
} from 'lucide-react';

/**
 * Money → Debts → "Owed to me": the lending ledger, the mirror of the debts list.
 *
 * A loan is NOT a debt with the sign flipped, which is why it has its own type and its own
 * screen: a debt is a monthly commitment with installments and a due day, a loan is an event
 * log of money handed over and money that came back.
 *
 * Balance deducts the OUTSTANDING total (see MoneyOverview's 'loans' deduction row) — money
 * you have lent is out of your hands, so it should not read as spendable — and every
 * repayment logged here shrinks that deduction. A repayment that actually lands in your
 * pocket is still logged as income by the user, from the quick-add radial, exactly as any
 * other money in.
 *
 * Every figure on screen is derived from the loan's own event log (lib/loans.ts): lending
 * the same person more later appends a second 'lent' event rather than editing a total, so
 * the timeline always explains the balance above it.
 */
export function LoansList() {
  const { loans, history, addLoan, deleteLoan, restoreLoan } = useContext(AppDataContext);
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();
  usePageFab(pathname === '/');   // this tab owns the page's + FAB while it is open

  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<Movement | null>(null);
  const [settledOpen, setSettledOpen] = useState(false);

  const list = useMemo(() => loans ?? [], [loans]);

  // Most recent movement first: a loan you were just repaid is the one you are thinking
  // about. Settled ones drop to their own fold at the bottom rather than out of existence —
  // "did they ever pay me back?" is a question this ledger has to keep answering.
  const { active, settled } = useMemo(() => {
    const byRecency = [...list].sort((a, b) => loanLastActivity(b) - loanLastActivity(a));
    return {
      active: byRecency.filter(l => !isLoanSettled(l)),
      settled: byRecency.filter(isLoanSettled),
    };
  }, [list]);

  // Read the open loan out of state rather than holding a copy: recording a repayment must
  // update the sheet you recorded it in.
  const openLoan = openId ? list.find(l => l.id === openId) ?? null : null;

  // Everyone the app already knows: people you have lent to before, plus the debt roster —
  // the same person often turns up on both sides over time.
  const knownPeople = useMemo(() => {
    const seen = new Set<string>();
    return [...list.map(l => l.person), ...derivePersonProfiles(history).map(p => p.name)]
      .filter(n => {
        const k = personKey(n);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [list, history]);

  const removeLoan = (loan: Loan) => {
    deleteLoan(loan.id);
    showUndoToast(`Deleted loan to ${loan.person}`, () => restoreLoan(loan));
  };

  const openDetail = (id: string, mode: Movement | null = null) => {
    setOpenId(id);
    setOpenMode(mode);
  };

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-base">Nobody owes you a thing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No money lent out yet.</p>
            <p className="text-xs text-muted-foreground">Tap the + button to record a loan.</p>
          </CardContent>
        </Card>
      ) : (
        active.map(loan => (
          <LoanRow
            key={loan.id}
            loan={loan}
            onOpen={() => openDetail(loan.id)}
            onRepay={() => openDetail(loan.id, 'repaid')}
            onDelete={() => removeLoan(loan)}
          />
        ))
      )}

      {settled.length > 0 && (
        <div className="bg-card rounded-2xl overflow-hidden">
          <button
            onClick={() => { hapticTick(); setSettledOpen(v => !v); }}
            aria-expanded={settledOpen}
            className="w-full flex items-center gap-2 p-3.5 text-left active:bg-muted/40 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--positive))] shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
              Settled
            </p>
            <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{settled.length}</span>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground/60 transition-transform duration-200', settledOpen && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {settledOpen && (
              <motion.div
                key="settled-loans"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 }}
                className="overflow-hidden"
              >
                <div className="px-2.5 pb-2.5 space-y-1.5">
                  {settled.map(loan => (
                    <button
                      key={loan.id}
                      onClick={() => openDetail(loan.id)}
                      className="w-full flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2.5 text-left"
                    >
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--positive))] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{loan.person}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                          {loan.settledAt && loanOutstanding(loan) > 0
                            ? `Closed with ${formatCurrency(loanOutstanding(loan))} unpaid`
                            : `Paid back in full · ${formatCurrency(loanLent(loan))}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Same FAB the debts tab uses — one + at the bottom of the Money page, doing
          whatever the open tab adds. Pathname-gated because the carousel keeps this page
          mounted behind the others. */}
      {pathname === '/' && (
        <FixedPortal>
          <button
            aria-label="Record money lent"
            data-tour="money-fab"
            onClick={() => setAddOpen(true)}
            className="fab-blurable fixed left-1/2 -translate-x-1/2 h-12 w-12 rounded-full focus:outline-none transition-transform hover:scale-105 z-40"
            style={{ bottom: 'calc(10px + var(--sab))', ...FAB_TOUCH_STYLE }}
            {...fabLongPress}
          >
            <FabPulse><Plus className="h-5 w-5" /></FabPulse>
          </button>
        </FixedPortal>
      )}

      <AddLoanDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        knownPeople={knownPeople}
        onSubmit={addLoan}
      />

      <LoanDetailDialog
        key={openLoan?.id ?? 'none'}
        loan={openLoan}
        initialMode={openMode}
        onClose={() => { setOpenId(null); setOpenMode(null); }}
        onDelete={loan => { setOpenId(null); removeLoan(loan); }}
      />
    </div>
  );
}

// ─── One loan in the list ─────────────────────────────────────────────────────

function LoanRow({ loan, onOpen, onRepay, onDelete }: {
  loan: Loan; onOpen: () => void; onRepay: () => void; onDelete: () => void;
}) {
  const lent = loanLent(loan);
  const repaid = loanRepaid(loan);
  const pct = loanProgress(loan) * 100;
  const overdue = isLoanOverdue(loan);
  const settled = isLoanSettled(loan);

  return (
    <SwipeableRow
      rightActions={[
        { icon: HandCoins, label: 'Repaid', tone: 'accent', onAction: onRepay },
        { icon: Trash2, label: 'Delete', tone: 'destructive', onAction: onDelete },
      ]}
    >
      {/* Same list card as the Payable ledger (DebtCard). Tapping the row opens
          the detail sheet — no edit-icon slot, unlike the debt card. */}
      <button onClick={onOpen} className="block w-full text-left">
        <LedgerRow
          progress={pct}
          paidOff={settled}
          title={loan.reason
            ? <>{loan.person}<span className="text-xs font-medium text-muted-foreground"> - {loan.reason}</span></>
            : loan.person}
          badge={loan.dueDate ? (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              overdue ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground',
            )}>
              <CalendarClock className="h-2.5 w-2.5" />
              {overdue ? 'Overdue' : `Due ${format(new Date(`${loan.dueDate}T00:00:00`), 'd MMM')}`}
            </span>
          ) : undefined}
          meta={`${displayProgressPct(pct)}%`}
          // The Payable row ends in a card icon (its edit button). This row opens on tap, so
          // the slot carries a plain marker instead — same ghost-icon box as DebtCard so the
          // two ledgers line up and the icon picks up the same auto-contrast colour, with
          // HandCoins standing in for CreditCard: money handed over, not paid off. Pointer
          // events off because it is a marker, not a button — the whole row is the target.
          action={
            <span className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8 flex-shrink-0 pointer-events-none')}>
              <HandCoins className="h-4 w-4" />
            </span>
          }
          footerLeft={repaid > 0 ? `${formatCurrency(repaid)} Back` : 'Nothing back yet'}
          footerRight={`/ ${formatCurrency(lent)}`}
        />
      </button>
    </SwipeableRow>
  );
}

// ─── Add a loan ───────────────────────────────────────────────────────────────

function AddLoanDialog({ open, onOpenChange, knownPeople, onSubmit }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  knownPeople: string[];
  onSubmit: (person: string, amount: number, opts?: { reason?: string; date?: string; dueDate?: string; note?: string }) => void;
}) {
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  const suggestions = useMemo(() => {
    const q = personKey(person);
    if (!q) return [];
    return knownPeople.filter(n => personKey(n).includes(q) && personKey(n) !== q).slice(0, 3);
  }, [person, knownPeople]);

  const reset = () => {
    setPerson(''); setAmount(''); setReason('');
    setDate(format(new Date(), 'yyyy-MM-dd')); setDueDate(''); setError('');
  };

  const submit = () => {
    const amt = parseFloat(amount);
    if (!person.trim()) { setError('Who borrowed the money?'); return; }
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    hapticTap();
    onSubmit(person, amt, { reason, date, dueDate: dueDate || undefined });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Money lent out</DialogTitle>
          <DialogDescription>Record what you handed over and when. Repayments go on afterwards.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-xs">Who borrowed it</Label>
            <Input
              placeholder="e.g., Dad"
              value={person} onChange={e => setPerson(e.target.value)}
              className="h-9 text-sm" autoFocus
            />
            {/* Same trick the add-debt form uses: suggestions only once you start typing,
                capped at three, so the field never turns into a roster. */}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {suggestions.map(n => (
                  <button
                    key={n}
                    onClick={() => setPerson(n)}
                    className="rounded-full bg-muted/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground active:bg-muted"
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Amount</Label>
            <Input
              type="number" inputMode="decimal" placeholder="e.g., 500"
              value={amount} onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">What for (optional)</Label>
            <Input
              placeholder="e.g., Lunch"
              value={reason} onChange={e => setReason(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Date lent</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pay-back date (optional)</Label>
            <DatePicker value={dueDate} onChange={setDueDate} />
            <p className="text-[10px] text-muted-foreground/60">
              Only marks the loan overdue on the card — nothing is scheduled or reminded.
            </p>
          </div>

          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={submit} className="w-full h-9 text-xs">Add loan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── One loan, in full ────────────────────────────────────────────────────────

type Movement = LoanEvent['type'];

function LoanDetailDialog({ loan, initialMode, onClose, onDelete }: {
  loan: Loan | null;
  initialMode: Movement | null;
  onClose: () => void;
  onDelete: (loan: Loan) => void;
}) {
  const { addLoanEvent, deleteLoanEvent, restoreLoanEvent, setLoanSettled } = useContext(AppDataContext);
  const [mode, setMode] = useState<Movement | null>(initialMode);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // The dialog is keyed on the loan id below, so opening a different loan (or the same one
  // in repayment mode) remounts this with fresh fields rather than reusing stale ones.

  if (!loan) return null;

  const lent = loanLent(loan);
  const repaid = loanRepaid(loan);
  const outstanding = loanOutstanding(loan);
  const settled = isLoanSettled(loan);
  const pct = loanProgress(loan) * 100;
  const events = loanEventsNewestFirst(loan);

  const closeForm = () => { setMode(null); setAmount(''); setNote(''); setError(''); };

  const save = () => {
    if (!mode) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    hapticTap();
    addLoanEvent(loan.id, { type: mode, amount: amt, date, note });
    closeForm();
  };

  const removeEvent = (e: LoanEvent) => {
    deleteLoanEvent(loan.id, e.id);
    showUndoToast(
      `Removed ${e.type === 'lent' ? 'loan' : 'repayment'} of ${formatCurrency(e.amount)}`,
      () => restoreLoanEvent(loan.id, e),
    );
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <LedgerDetailContent
        a11yTitle={loan.person}
        hero={
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-4">
              <DebtSemiGauge progress={pct} paidOff={settled} />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-foreground leading-tight break-words">{loan.person}</h2>
                <p className="text-xs font-medium text-accent mt-0.5">
                  {loan.reason || 'Money lent'}
                  {loan.dueDate && ` · due ${format(new Date(`${loan.dueDate}T00:00:00`), 'd MMM yyyy')}`}
                </p>
                <div className="mt-3 space-y-0.5">
                  <p
                    className="text-sm font-semibold text-primary"
                    style={settled ? { color: 'hsl(var(--primary-complete))' } : undefined}
                  >{formatCurrency(repaid)} back</p>
                  <p className="text-xs text-muted-foreground">of {formatCurrency(lent)}</p>
                  {outstanding > 0 && (
                    <p className="text-xs text-muted-foreground/70">{formatCurrency(outstanding)} still owed</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        }
        actions={<>
          {/* Closing by hand is for the loans that never come back in money: written off, or
              settled some other way. A fully repaid loan settles itself. */}
          <Button
            size="sm" variant="secondary" className="flex-1 h-9 text-xs"
            onClick={() => { hapticTick(); setLoanSettled(loan.id, !loan.settledAt); }}
          >
            {loan.settledAt
              ? <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen</>
              : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {outstanding > 0 ? 'Write off' : 'Settled'}</>}
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-9 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(loan)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </>}
      >
        {/* Adding to the ledger. Two buttons rather than a type switch inside one form:
            "they paid me back" and "I lent more" are different intentions, and naming both
            beats making the user set a dropdown correctly. */}
        {!mode ? (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-9 text-xs" onClick={() => setMode('repaid')}>
              <ArrowDownLeft className="h-3.5 w-3.5 mr-1" /> Record repayment
            </Button>
            <Button size="sm" variant="secondary" className="flex-1 h-9 text-xs" onClick={() => setMode('lent')}>
              <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Lend more
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {mode === 'repaid' ? 'Repayment received' : 'More money lent'}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number" inputMode="decimal"
                placeholder={mode === 'repaid' && outstanding > 0 ? String(outstanding) : 'e.g., 200'}
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                className="h-9 text-sm" autoFocus
              />
              {mode === 'repaid' && outstanding > 0 && (
                <button
                  onClick={() => setAmount(String(outstanding))}
                  className="text-[10px] font-semibold text-accent"
                >
                  Paid in full ({formatCurrency(outstanding)})
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Input
                placeholder={mode === 'repaid' ? 'e.g., cash' : 'e.g., for groceries'}
                value={note} onChange={e => setNote(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-9 text-xs" onClick={save}>Save</Button>
              <Button size="sm" variant="ghost" className="h-9 text-xs px-3" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        )}

        {/* The log itself — the whole point of the tab: when they borrowed, when they paid. */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Timeline</p>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nothing recorded yet.</p>
          ) : events.map(e => (
            // Which way the money went is already in the line's own words and in the
            // signed, coloured amount — the same way an expense row reads — so the row
            // carries no separate kind marker.
            <div key={e.id} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground truncate">
                  {e.type === 'repaid' ? 'Paid back' : 'Lent'}
                  {e.note ? <span className="font-normal text-muted-foreground"> · {e.note}</span> : null}
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(`${e.date}T00:00:00`), 'd MMM yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn(
                  'text-sm font-bold tabular-nums',
                  e.type === 'repaid' ? 'text-[hsl(var(--positive))]' : 'text-foreground',
                )}>
                  {e.type === 'repaid' ? '+' : '−'}{formatCurrency(e.amount)}
                </span>
                <button
                  onClick={() => removeEvent(e)}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Remove entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </LedgerDetailContent>
    </Dialog>
  );
}
