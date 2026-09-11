'use client';

import { useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { cycleLabelFromKey, getPayCycle, listRecentCycles } from '@/lib/calculations';
import { bankBalance, bankProgress, entriesOfBank, isBankFull } from '@/lib/piggybanks';
import { Dialog } from '@/components/ui/dialog';
import { LedgerDetailContent } from '@/components/ledger/LedgerDetailContent';
import { DebtSemiGauge } from '@/components/DebtSemiGauge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showUndoToast } from '@/components/ui/undo-toast';
import { hapticTap, hapticTick } from '@/lib/haptics';
import type { Piggybank, SavingEntry } from '@/lib/types';
import {
  ArrowDownLeft, ArrowUpRight, Pause, Pencil, PiggyBank, Play, RotateCcw, Sparkles, Trash2,
} from 'lucide-react';

/**
 * One piggybank, opened. The same sheet frame the Payable and Receivable ledgers use
 * (LedgerDetailContent + DebtSemiGauge), because a jar filling toward a goal is the same
 * shape of thing as a debt paying down toward zero.
 *
 * Four things live in here, in the order you need them: put money in or take it out, the
 * standing orders that do it for you, what the jar is called and aiming at, and the log of
 * every movement.
 */
export function PiggybankDetailDialog({ bank, onClose }: {
  bank: Piggybank | null;
  onClose: () => void;
}) {
  const { savings, recurringSavings, userProfile, addSaving, deleteSaving, restoreSaving,
          updatePiggybank, deletePiggybank, restorePiggybank,
          addRecurringSaving, setRecurringSavingActive, deleteRecurringSaving } = useContext(AppDataContext);

  const payDay = userProfile.paydayDay;
  const cycle = useMemo(() => getPayCycle(payDay), [payDay]);
  const cycleOptions = useMemo(() => listRecentCycles(payDay, 11), [payDay]);

  // Which form is open: a movement, the rename/goal editor, or a new standing order.
  const [mode, setMode] = useState<'in' | 'out' | 'edit' | 'order' | null>(null);
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [cycleKey, setCycleKey] = useState(cycle.key);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [orderLabel, setOrderLabel] = useState('');

  const entries = useMemo(
    () => (bank ? entriesOfBank(savings ?? [], bank.id) : []).slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [savings, bank],
  );
  const orders = useMemo(
    () => (recurringSavings ?? []).filter(r => bank && r.bankId === bank.id),
    [recurringSavings, bank],
  );

  if (!bank) return null;

  const balance = bankBalance(savings ?? [], bank.id);
  const progress = bankProgress(bank, balance);
  const full = isBankFull(bank, balance);
  const pct = progress != null ? progress * 100 : 0;
  const toGo = bank.target ? Math.max(0, bank.target - balance) : 0;
  const paidIn = entries.filter(e => e.direction !== 'out').reduce((s, e) => s + e.amount, 0);
  const takenOut = entries.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0);

  const closeForm = () => {
    setMode(null); setAmount(''); setLabel(''); setError('');
    setOrderAmount(''); setOrderLabel(''); setCycleKey(cycle.key);
  };

  const saveMovement = () => {
    if (mode !== 'in' && mode !== 'out') return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    // Taking out more than the jar holds is almost always a typo, and letting it through
    // leaves a negative balance that every figure downstream has to explain.
    if (mode === 'out' && amt > balance) { setError(`Only ${formatCurrency(balance)} in this piggybank.`); return; }
    hapticTap();
    addSaving(amt, cycleKey, label.trim() || (mode === 'out' ? 'Withdrawal' : 'Deposit'), undefined, bank.id, mode);
    closeForm();
  };

  const saveEdit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Give it a name.'); return; }
    const t = target.trim() ? parseFloat(target) : undefined;
    if (t != null && (isNaN(t) || t < 0)) { setError('Enter a valid goal, or leave it blank.'); return; }
    hapticTap();
    updatePiggybank(bank.id, { name: trimmed, target: t && t > 0 ? t : undefined });
    closeForm();
  };

  const saveOrder = () => {
    const amt = parseFloat(orderAmount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    hapticTap();
    addRecurringSaving(bank.id, amt, orderLabel.trim() || `${bank.name} contribution`);
    closeForm();
  };

  const removeEntry = (e: SavingEntry) => {
    deleteSaving(e.id);
    showUndoToast(
      `Removed ${e.direction === 'out' ? 'withdrawal' : 'deposit'} of ${formatCurrency(e.amount)}`,
      () => restoreSaving(e),
    );
  };

  const remove = () => {
    const removed = deletePiggybank(bank.id);
    onClose();
    if (removed.bank) {
      showUndoToast(`Closed "${removed.bank.name}"`, () => restorePiggybank(removed));
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <LedgerDetailContent
        a11yTitle={bank.name}
        hero={
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-4">
              {/* No goal, no gauge: an arc with nothing to fill toward says nothing. The
                  jar then leads with its balance, which is the only fact it has. */}
              {progress != null
                ? <DebtSemiGauge progress={pct} paidOff={full} />
                : <span className="h-16 w-16 shrink-0 flex items-center justify-center rounded-full bg-secondary">
                    <PiggyBank className="h-7 w-7 text-accent" />
                  </span>}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-foreground leading-tight break-words">{bank.name}</h2>
                <p className="text-xs font-medium text-accent mt-0.5">
                  {bank.isLeftovers ? 'Swept here at cycle end' : bank.target ? `Goal ${formatCurrency(bank.target)}` : 'No goal set'}
                </p>
                <div className="mt-3 space-y-0.5">
                  <p
                    className="text-sm font-semibold text-primary"
                    style={full ? { color: 'hsl(var(--primary-complete))' } : undefined}
                  >
                    {formatCurrency(balance)} in
                  </p>
                  {bank.target
                    ? <p className="text-xs text-muted-foreground">of {formatCurrency(bank.target)}</p>
                    : <p className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? 'movement' : 'movements'}</p>}
                  {toGo > 0 && <p className="text-xs text-muted-foreground/70">{formatCurrency(toGo)} to go</p>}
                  {takenOut > 0 && (
                    <p className="text-xs text-muted-foreground/70">
                      {formatCurrency(paidIn)} in · {formatCurrency(takenOut)} out
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        }
        actions={<>
          <Button
            size="sm" variant="secondary" className="flex-1 h-9 text-xs"
            onClick={() => {
              hapticTick();
              setName(bank.name); setTarget(bank.target ? String(bank.target) : '');
              setError(''); setMode(mode === 'edit' ? null : 'edit');
            }}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" /> Rename / goal
          </Button>
          {/* The leftovers jar has nowhere to hand its job to, so it cannot be closed. */}
          {!bank.isLeftovers && (
            <Button
              size="sm" variant="ghost"
              className="h-9 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={remove}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Close
            </Button>
          )}
        </>}
      >
        {/* Two buttons rather than a direction switch inside one form: "putting money away"
            and "taking it back" are different intentions, and naming both beats making the
            user set a toggle correctly. */}
        {mode === null && (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-9 text-xs" onClick={() => { setMode('in'); setError(''); }}>
              <ArrowDownLeft className="h-3.5 w-3.5 mr-1" /> Add money
            </Button>
            <Button
              size="sm" variant="secondary" className="flex-1 h-9 text-xs"
              disabled={balance <= 0}
              onClick={() => { setMode('out'); setError(''); }}
            >
              <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Take out
            </Button>
          </div>
        )}

        {(mode === 'in' || mode === 'out') && (
          <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {mode === 'in' ? 'Money in' : 'Money out'}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number" inputMode="decimal"
                placeholder={mode === 'out' ? String(balance) : 'e.g., 500'}
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveMovement()}
                className="h-9 text-sm" autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                placeholder={mode === 'out' ? 'e.g., car repair' : 'e.g., bonus'}
                value={label} onChange={e => setLabel(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cycle</Label>
              {/* Which cycle's Balance this lands on — defaults to the one you are in. */}
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
              <Button size="sm" className="flex-1 h-9 text-xs" onClick={saveMovement}>Save</Button>
              <Button size="sm" variant="ghost" className="h-9 text-xs px-3" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rename / goal</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Goal (optional)</Label>
              <Input
                type="number" inputMode="decimal" placeholder="Leave blank for no goal"
                value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="h-9 text-sm"
              />
            </div>
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-9 text-xs" onClick={saveEdit}>Save</Button>
              <Button size="sm" variant="ghost" className="h-9 text-xs px-3" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── Standing orders ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
              Every cycle
            </p>
            {mode !== 'order' && (
              <button
                onClick={() => { setMode('order'); setError(''); }}
                className="text-[10px] font-semibold text-accent"
              >
                + Add
              </button>
            )}
          </div>

          {orders.length === 0 && mode !== 'order' && (
            <p className="text-xs text-muted-foreground py-1">
              Nothing automatic yet — add a standing order and it comes off every cycle on its own.
            </p>
          )}

          {orders.map(o => (
            <div key={o.id} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground truncate">{o.label}</span>
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                    o.active === false ? 'bg-muted text-muted-foreground' : 'bg-positive/15 text-positive',
                  )}>
                    <RotateCcw className="h-2.5 w-2.5" />
                    {o.active === false ? 'Paused' : 'Every cycle'}
                  </span>
                  <p className="text-xs text-muted-foreground truncate">
                    since {format(new Date(o.createdAt), 'MMM yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(o.amount)}</span>
                <button
                  onClick={() => { hapticTick(); setRecurringSavingActive(o.id, o.active === false); }}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={o.active === false ? `Resume ${o.label}` : `Pause ${o.label}`}
                >
                  {o.active === false ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => deleteRecurringSaving(o.id)}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Remove ${o.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {mode === 'order' && (
            <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount every cycle</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="e.g., 500"
                  value={orderAmount} onChange={e => setOrderAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveOrder()}
                  className="h-9 text-sm" autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Label (optional)</Label>
                <Input
                  placeholder="e.g., Payday transfer"
                  value={orderLabel} onChange={e => setOrderLabel(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              {error && <p className="text-[10px] text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-9 text-xs" onClick={saveOrder}>Add standing order</Button>
                <Button size="sm" variant="ghost" className="h-9 text-xs px-3" onClick={closeForm}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {/* ── The log ─────────────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Movements</p>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nothing in here yet.</p>
          ) : entries.map(e => {
            const out = e.direction === 'out';
            return (
              <div key={e.id} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground truncate">{e.label}</span>
                  <div className="flex items-center gap-2 mt-1 min-w-0">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                      out ? 'bg-negative/15 text-negative'
                        : e.source === 'auto' ? 'bg-positive/15 text-positive'
                        : e.source === 'recurring' ? 'bg-snapshot/15 text-snapshot'
                        : 'bg-primary/15 text-primary',
                    )}>
                      {out ? <ArrowUpRight className="h-2.5 w-2.5" />
                        : e.source === 'auto' ? <Sparkles className="h-2.5 w-2.5" />
                        : e.source === 'recurring' ? <RotateCcw className="h-2.5 w-2.5" />
                        : <ArrowDownLeft className="h-2.5 w-2.5" />}
                      {out ? 'Out' : e.source === 'auto' ? 'Swept' : e.source === 'recurring' ? 'Standing order' : 'In'}
                    </span>
                    <p className="text-xs text-muted-foreground truncate">{cycleLabelFromKey(e.cycleKey, payDay)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn(
                    'text-sm font-bold tabular-nums',
                    out ? 'text-[hsl(var(--negative))]' : 'text-[hsl(var(--positive))]',
                  )}>
                    {out ? '−' : '+'}{formatCurrency(e.amount)}
                  </span>
                  <button
                    onClick={() => removeEntry(e)}
                    className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Remove ${e.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </LedgerDetailContent>
    </Dialog>
  );
}
