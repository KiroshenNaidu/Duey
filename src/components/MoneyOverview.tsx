'use client';

import { useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import {
  calculateLiveMonthly, calculateProjectedCycle, calculateSealedCycleSummary, cycleKey,
  cycleLabelFromKey, cycleStartFromKey, getPayCycle, isTransportPaidForMonth, nextCycleStart,
  stepCycleKey, type MonthlyMoney,
} from '@/lib/calculations';
import { outstandingBefore, summariseLoans } from '@/lib/loans';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, Plus, Trash2, X, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { showUndoToast } from '@/components/ui/undo-toast';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';

export function MoneyOverview() {
  const {
    monthlyIncome, budgetPlans, expenses, extraIncomes, history, uberRides, loans, debts,
    transportSettings, transportOverrides, transportMonthlyOverrides, userProfile, savings, recurringSavings,
    setMonthlyIncome, addExtraIncome, deleteExtraIncome, restoreExtraIncome,
  } = useContext(AppDataContext);

  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [showAllDeductions, setShowAllDeductions] = useState(false);
  const toggleExclude = (id: string) =>
    setExcludedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Extra income add form
  const [addingExtra, setAddingExtra] = useState(false);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraRecurring, setExtraRecurring] = useState(false);
  const [extraError, setExtraError] = useState('');

  // Re-arms the cycle hairline's fill every time this page becomes active, exactly as the
  // Debts page re-arms its payoff bars — the carousel keeps pages mounted, so a plain mount
  // effect would animate once and never again.
  const barReady = useReplayOnActive('/');

  const now = new Date();
  // The window every figure below is measured over: pay date → day before the next one.
  // Editable in Settings → Pay Date; with a pay day of 1 it is the calendar month.
  const cycle = getPayCycle(userProfile.paydayDay, now);
  // Last day of the cycle — the bar takes on the Debts page's "done" colours and glow, the
  // same way a settled debt's bar does. daysLeft is never 0: on pay day itself a fresh
  // cycle has already started, so the count is that cycle's full length.
  const resetImminent = cycle.daysLeft <= 1;
  // Single shared calculator (also drives Stats + the pay-cycle seal) so every screen
  // agrees. It honours the live per-month transport override and counts only debt money
  // actually logged as a payment this cycle — nothing is deducted until you log a payment.
  const payDay = userProfile.paydayDay;
  const input = useMemo(
    () => ({
      payDay, monthlyIncome, extraIncomes: extraIncomes ?? [], expenses, budgetPlans, history, uberRides,
      savings, recurringSavings, transportSettings, transportOverrides, transportMonthlyOverrides,
    }),
    [payDay, monthlyIncome, extraIncomes, expenses, budgetPlans, history, uberRides, savings,
     recurringSavings, transportSettings, transportOverrides, transportMonthlyOverrides],
  );
  const totalExtra = (extraIncomes ?? []).reduce((s, e) => s + e.amount, 0);

  // ── Which cycle the Deductions + Remaining cards show ──
  // Keyed, not indexed, exactly like Stats → Pay cycle. null follows the running cycle, so
  // a pay date passing while the app is open never strands you on the old one. The Income
  // card above stays on the running cycle: it is where you EDIT income, and a sealed
  // cycle's salary is not something the app can change.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const viewKey = pickedKey ?? cycle.key;
  const viewing: 'live' | 'sealed' | 'projected' =
    viewKey === cycle.key ? 'live' : viewKey < cycle.key ? 'sealed' : 'projected';
  // Forward stops at next cycle — the furthest one with anything real to project (standing
  // orders, recurring expenses and extras, the transport calendar). Back stops at the
  // oldest cycle History has anything in, the same floor Stats draws its timeline from:
  // before that, a recompute invents a cycle out of today's salary.
  const lastKey = stepCycleKey(cycle.key, payDay, 1);
  const firstKey = useMemo(() => {
    let earliest = cycle.key;
    for (const h of history) {
      const k = cycleKey(new Date(h.date), payDay);
      if (k < earliest) earliest = k;
    }
    return earliest;
  }, [history, payDay, cycle.key]);
  const step = (dir: -1 | 1) => {
    const next = stepCycleKey(viewKey, payDay, dir);
    setPickedKey(next === cycle.key ? null : next);
  };

  // Sealed cycles read the breakdown frozen into their History summary, as Stats and the
  // History detail sheet do — recomputing drifts once one-time extras and expenses have
  // been purged. Only summaries sealed before that field existed fall back to a recompute.
  const sealedSnapshot = useMemo<MonthlyMoney | null>(() => {
    if (viewing !== 'sealed') return null;
    for (const h of history) {
      if (h.type !== 'snapshot' || !h.snapshot) continue;
      if (cycleKey(new Date(h.date), payDay) === viewKey) return { ...h.snapshot, savings: h.snapshot.savings ?? 0 };
    }
    return null;
  }, [viewing, history, payDay, viewKey]);

  const viewStart = viewing === 'live' ? cycle.start : cycleStartFromKey(viewKey, payDay);
  const viewEnd = viewing === 'live' ? cycle.end : nextCycleStart(viewStart, payDay);
  const viewLabel = viewing === 'live' ? cycle.label : cycleLabelFromKey(viewKey, payDay);

  // One shared calculator per kind of cycle, so Balance, Stats and the seal never disagree.
  // The running cycle honours the live per-month transport override and counts only debt
  // money actually logged as a payment — nothing is deducted until you log a payment. A
  // cycle still to come is projected from what repeats (see calculateProjectedCycle).
  const monthly: MonthlyMoney = useMemo(() => {
    if (viewing === 'live') return calculateLiveMonthly(input, new Date());
    if (viewing === 'sealed') return sealedSnapshot ?? calculateSealedCycleSummary(input, viewKey);
    return calculateProjectedCycle(input, debts ?? [], viewKey, new Date());
    // cycle.key is here for the day rolling over: `new Date()` is read inside, and the
    // cycle key is what changes when that day crosses a pay date.
  }, [viewing, input, sealedSnapshot, viewKey, debts, cycle.key]);
  const { transport: transportCost, uber: uberSpend, debt: debtInstallments, expenses: totalExpenses, budget: budgetSpent, savings: savedThisCycle } = monthly;
  // "Estimate" until Mark as Paid is logged for the month the cycle starts in. A cycle
  // still to come has nothing paid, by definition.
  const transportPaid = viewing !== 'projected' && isTransportPaidForMonth(history, viewing === 'live' ? now : viewStart);
  // Money handed to other people and not yet back (Debts → Receivable). It is out of your
  // hands, so it comes off the balance — and because this is OUTSTANDING (lent minus
  // repaid, settled loans excluded), every repayment you log shrinks the deduction.
  // A sealed cycle shows what was outstanding as it closed; a future one, what is
  // outstanding now, since nothing is scheduled to come back.
  const lentOut = viewing === 'sealed'
    ? outstandingBefore(loans ?? [], viewEnd)
    : summariseLoans(loans ?? []).outstanding;

  // "(this cycle)" only reads true on this cycle; the header names every other one.
  const when = viewing === 'live' ? ' (this cycle)' : '';
  const deductions = [
    { id: 'transport', label: `Transport${when}`, value: transportCost, estimate: !transportPaid },
    { id: 'uber',      label: `Uber${when}`,      value: uberSpend },
    { id: 'budget',    label: 'Budget (confirmed)', value: budgetSpent },
    {
      id: 'debts',
      label: viewing === 'projected' ? 'Debt payments (expected)' : `Debt payments${when}`,
      value: debtInstallments,
      estimate: viewing === 'projected',
    },
    { id: 'loans',     label: 'Money lent out (unpaid)', value: lentOut },
    {
      id: 'expenses',
      label: viewing === 'live' ? 'Expenses (active)' : viewing === 'projected' ? 'Expenses (recurring)' : 'Expenses',
      value: totalExpenses,
    },
    // This cycle's savings movement (Stats → Savings), and the one row that can go either
    // way. Money put away is out of your hands, so it comes off; money taken back OUT of a
    // piggybank is yours to spend again, so a net withdrawal shows as a credit and lifts
    // Remaining. The automatic leftover is excluded from the deposit side entirely: it IS
    // this card's remainder, and deducting that would subtract the same money twice.
    {
      id: 'savings',
      label: savedThisCycle < 0 ? 'Savings (taken out)' : 'Savings (put away)',
      value: savedThisCycle,
    },
  ];

  // Only what is actually coming off. A zero row states nothing — six of them state it
  // six times — so they are dropped, and with nothing to deduct the card goes entirely.
  // Rows tapped out are NOT dropped: their value is still real, so they stay visible (and
  // struck through) or you could never tap them back in.
  // A row with money in it EITHER way — a savings withdrawal is a real line, and
  // dropping it for not being positive would hide the reason Remaining went up.
  const activeDeductions = deductions.filter(d => d.value !== 0);
  // What the list actually shows: the ones with money in them, or every category once you
  // ask. The toggle is only offered when there is something hidden to reveal.
  const shownDeductions = showAllDeductions ? deductions : activeDeductions;
  const hiddenCount = deductions.length - activeDeductions.length;

  // Effective total excludes tapped-out rows (local state only — no data is changed).
  // Derived from the rows themselves: the old version kept a second, parallel array of
  // amounts that had to stay in the same order as the ids by hand, so a new row could be
  // shown in one place and silently missed in the other.
  const effectiveDeductions = activeDeductions
    .filter(d => !excludedIds.has(d.id))
    .reduce((s, d) => s + d.value, 0);
  // The running cycle's income is the card above. Any other cycle brings its own: what it
  // sealed with, or salary plus recurring extras for the one still to come.
  const viewIncome = viewing === 'live' ? monthlyIncome + totalExtra : monthly.income;
  const remaining = viewIncome - effectiveDeductions;
  // What the seal actually banked for a closed cycle — read from Savings rather than
  // re-derived, so the line agrees with the jar even while rows above are tapped out.
  const bankedLeftover = viewing === 'sealed'
    ? (savings ?? []).reduce((s, e) => (e.source === 'auto' && e.direction !== 'out' && e.cycleKey === viewKey ? s + e.amount : s), 0)
    : 0;

  const startEdit = () => { setIncomeInput(monthlyIncome > 0 ? monthlyIncome.toString() : ''); setEditingIncome(true); };
  const confirmEdit = () => {
    const val = parseFloat(incomeInput);
    if (!isNaN(val) && val >= 0) setMonthlyIncome(val);
    setEditingIncome(false);
  };

  const submitExtra = () => {
    if (!extraLabel.trim()) { setExtraError('Label is required.'); return; }
    const amt = parseFloat(extraAmount);
    if (isNaN(amt) || amt <= 0) { setExtraError('Enter a valid positive amount.'); return; }
    addExtraIncome(extraLabel.trim(), amt, extraRecurring);
    setExtraLabel(''); setExtraAmount(''); setExtraRecurring(false); setExtraError(''); setAddingExtra(false);
  };

  // Delete immediately with a 5s undo window.
  const handleDeleteExtra = (id: string) => {
    const item = (extraIncomes ?? []).find(e => e.id === id);
    if (!item) return;
    deleteExtraIncome(id);
    showUndoToast(`Removed "${item.label}"`, () => restoreExtraIncome(item));
  };

  return (
    <div className="space-y-3">
      {/* Monthly Income */}
      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Monthly Income</p>
          {editingIncome ? (
            <div className="flex items-center gap-2">
              <Input
                type="number" placeholder="e.g., 15000"
                value={incomeInput} onChange={e => setIncomeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmEdit()}
                autoFocus className="text-base font-bold"
              />
              <button onClick={confirmEdit} className="p-2 rounded-full bg-accent text-btn-on-accent shrink-0">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={startEdit} className="flex items-center gap-2 group w-full text-left">
              <span className="text-2xl font-bold text-foreground min-w-0">
                {monthlyIncome > 0 ? formatCurrency(monthlyIncome) : 'Set income'}
              </span>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}

          {/* How close the reset is, as a hairline under the figure it governs — the income
              and the window it covers are one fact, so they are one card. This replaces a
              whole Pay Cycle card: the countdown is the only part anyone reads day to day
              (the dates live in Settings → Pay Date, and on this row's hover title).

              Deliberately the SAME bar as the Debts page's payoff progress — flowing
              gradient (bar-animated), 700ms width ease armed by useReplayOnActive, and the
              switch to the completion gradient + bar-glow at the end — so "how far through
              a thing am I" looks identical wherever the app asks it. Here the end is the
              last day of the cycle rather than a settled debt. */}
          <div className="mt-2.5 flex items-center gap-2" title={cycle.label}>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {cycle.daysLeft} day{cycle.daysLeft === 1 ? '' : 's'} left
            </span>
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full bar-animated',
                  barReady && 'transition-[width] duration-700',
                  resetImminent && 'bar-glow',
                )}
                style={{
                  width: `${barReady ? Math.round(cycle.progress * 100) : 0}%`,
                  background: resetImminent
                    ? 'repeating-linear-gradient(to right, hsl(var(--primary-b)) 0%, hsl(var(--primary-complete)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary-complete)) 75%, hsl(var(--primary-b)) 100%)'
                    : 'repeating-linear-gradient(to right, hsl(var(--primary-a)) 0%, hsl(var(--primary)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary)) 75%, hsl(var(--primary-a)) 100%)',
                }}
              />
            </div>
          </div>

          {/* Extra income belongs to the salary it tops up, so it lives in the same card:
              one card answers "what is coming in this cycle". A hairline rule rather than a
              card gap keeps them one block while still separating the two questions. */}
          <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Extra Income</p>
              {!addingExtra && (
                <button
                  onClick={() => setAddingExtra(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-foreground hover:text-foreground/70 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>

            {(extraIncomes ?? []).length === 0 && !addingExtra && (
              <p className="text-[10px] text-muted-foreground/60 italic">No extra income added yet</p>
            )}

            {(extraIncomes ?? []).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground truncate flex-1 flex items-center gap-1.5">
                  {item.label}
                  {item.recurring && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/15 text-primary shrink-0">
                      <RefreshCw className="h-2 w-2" /> monthly
                    </span>
                  )}
                </span>
                {/* Muted: an individual extra is detail. The accent is spent on the total
                    below, so the eye lands on the one number that matters.
                    min-w-0 (not shrink-0): a huge amount must wrap inside the row, never widen it */}
                <span className="text-xs font-semibold text-muted-foreground tabular-nums min-w-0 text-right">+{formatCurrency(item.amount)}</span>
                <button
                  onClick={() => handleDeleteExtra(item.id)}
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}

            {addingExtra && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <Input
                  placeholder="Label (e.g., Freelance)"
                  value={extraLabel} onChange={e => setExtraLabel(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                />
                <Input
                  type="number" placeholder="Amount"
                  value={extraAmount} onChange={e => setExtraAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitExtra()}
                  className="h-8 text-xs"
                />
                <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Monthly</p>
                    <p className="text-[9px] text-muted-foreground">
                      {extraRecurring ? 'Counts every cycle until removed' : 'This cycle only — clears on your next pay date'}
                    </p>
                  </div>
                  <Switch checked={extraRecurring} onCheckedChange={setExtraRecurring} />
                </div>
                {extraError && <p className="text-[10px] text-destructive">{extraError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={submitExtra} className="flex-1 h-7 text-xs">Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingExtra(false); setExtraLabel(''); setExtraAmount(''); setExtraRecurring(false); setExtraError(''); }} className="h-7 text-xs px-2">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {totalExtra > 0 && (
              <div className="flex justify-between items-baseline border-t border-border/40 pt-2 mt-1">
                {/* Label shrink-0 so a huge total wraps instead of crushing it letter-by-letter */}
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Total Extra</span>
                <span className="text-sm font-bold text-accent tabular-nums min-w-0 text-right">+{formatCurrency(totalExtra)}</span>
              </div>
            )}
          </div>

          {/* Total income (salary + extras) — the bottom line of the same card that
              builds it, on its own hairline rule rather than floating in a card of
              its own: it is the answer to this card's question, not a new one. */}
          <div className="mt-3 pt-3 border-t border-border/40 flex justify-between items-baseline">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Total Income</span>
            <span className="text-lg font-bold text-primary tabular-nums min-w-0 text-right">+{formatCurrency(monthlyIncome + totalExtra)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Deductions, for any cycle from the oldest History knows up to the next one. Always
          present: it used to vanish when nothing was being deducted, but its chevrons are
          now the way to other cycles, and those must not disappear with an empty one. */}
      <Card>
        <CardContent className="p-3 space-y-2">
          {/* Same stepper as Stats → Pay cycle: chevrons either side, the cycle in between. */}
          <div className="flex items-center gap-1 -mx-1.5 -mt-1.5">
            <button
              onClick={() => step(-1)}
              disabled={viewKey <= firstKey}
              aria-label="Previous cycle"
              className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-25 active:bg-muted/60"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* Tapping the middle jumps back to the running cycle. */}
            <button
              onClick={() => setPickedKey(null)}
              disabled={viewing === 'live'}
              className="flex-1 min-w-0 px-1 text-center"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deductions</p>
              <p className={cn('text-xs font-semibold truncate mt-0.5', viewing === 'live' ? 'text-foreground' : 'text-accent')}>
                {viewLabel}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {viewing === 'live'
                  ? 'This cycle · still running'
                  : viewing === 'sealed'
                    ? `Sealed${sealedSnapshot ? '' : ' · recalculated'} · tap for this cycle`
                    : 'Projected · recurring only · tap for this cycle'}
              </p>
            </button>
            <button
              onClick={() => step(1)}
              disabled={viewKey >= lastKey}
              aria-label="Next cycle"
              className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-25 active:bg-muted/60"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {activeDeductions.length === 0 && !showAllDeductions && (
            <p className="text-[10px] text-muted-foreground/60 italic">
              {viewing === 'projected' ? 'Nothing recurring is set to come off' : 'Nothing came off in this cycle'}
            </p>
          )}
          {shownDeductions.map(d => {
            const off = excludedIds.has(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggleExclude(d.id)}
                className={cn('flex justify-between items-baseline w-full text-left transition-opacity', off && 'opacity-35')}
              >
                <span className={cn('text-xs text-muted-foreground shrink-0', off && 'line-through')}>
                  {d.label}
                  {d.estimate && <span className="ml-1 text-[9px] font-medium text-muted-foreground/50">(estimate)</span>}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums min-w-0 text-right', off && 'line-through',
                  d.value > 0 ? 'text-foreground'
                    : d.value < 0 ? 'text-[hsl(var(--positive))]'
                    : 'text-muted-foreground/50')}>
                  {d.value > 0 ? `−${formatCurrency(d.value)}`
                    : d.value < 0 ? `+${formatCurrency(Math.abs(d.value))}`
                    : formatCurrency(0)}
                </span>
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowAllDeductions(v => !v)}
                className="text-[10px] font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0"
              >
                {showAllDeductions ? 'Show less' : 'Show all'}
              </button>
            </div>
          )}
          {activeDeductions.length > 0 && (
          <div className="border-t border-border pt-2 mt-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground shrink-0">Total deductions</span>
              <span className="text-sm font-bold text-foreground tabular-nums min-w-0 text-right">
                {effectiveDeductions < 0 ? '+' : '−'}{formatCurrency(Math.abs(effectiveDeductions))}
              </span>
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Remaining */}
      <Card className={cn('border-2', remaining >= 0 ? 'border-accent/40' : 'border-destructive/40')}>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            {viewing === 'live' ? 'Remaining' : viewing === 'sealed' ? 'Left over' : 'Projected remaining'}
          </p>
          <p className={cn('text-3xl font-bold tabular-nums', remaining >= 0 ? 'text-accent' : 'text-destructive')}>
            {remaining < 0 ? `−${formatCurrency(Math.abs(remaining))}` : formatCurrency(remaining)}
          </p>
          {/* Another cycle's income is not the card above, so it is named here. */}
          {viewing !== 'live' && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              From {formatCurrency(viewIncome)} income{viewing === 'projected' ? ' (salary + monthly extras)' : ''} · {viewLabel}
            </p>
          )}
          {remaining < 0 && (
            <p className="text-[10px] text-destructive mt-0.5">
              {viewing === 'live' ? 'You\u2019re over budget this cycle'
                : viewing === 'sealed' ? 'This cycle ended over budget'
                : 'On track to go over budget next cycle'}
            </p>
          )}
          {/* Closes the loop with Stats → Savings: what survives the cycle is swept there by
              the seal. Deliberately phrased as "whatever's left", not the figure above —
              that one moves with the deduction rows you tap out, the sweep never does. */}
          {viewing === 'live' && remaining > 0 && monthlyIncome > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Whatever&apos;s left on {format(cycle.end, 'd MMM')} is banked in Savings
            </p>
          )}
          {viewing === 'sealed' && bankedLeftover > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatCurrency(bankedLeftover)} was banked in Savings
            </p>
          )}
          {viewing === 'projected' && remaining > 0 && monthlyIncome > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Whatever&apos;s left on {format(viewEnd, 'd MMM')} is banked in Savings
            </p>
          )}
          {monthlyIncome === 0 && <p className="text-[10px] text-muted-foreground mt-0.5">Set your monthly income above to see your balance</p>}
        </CardContent>
      </Card>
    </div>
  );
}
