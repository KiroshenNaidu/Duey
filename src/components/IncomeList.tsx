'use client';

import { useContext, useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { Plus, Trash2, RefreshCw, Pencil, Eye } from 'lucide-react';
import { BreakdownDonutDialog } from '@/components/ExpensesList';
import { FixedPortal } from '@/components/FixedPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { useFabLongPress, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { SwipeableRow } from '@/components/SwipeableRow';
import { showUndoToast } from '@/components/ui/undo-toast';
import { clearsWhen } from '@/lib/cycles';
import type { ExtraIncome } from '@/lib/types';
import { confirmDelete } from '@/components/ui/confirm-delete';

/**
 * Money → Cashflow → Incoming, the mirror of ExpensesList. Stored in `extraIncomes` tagged
 * kind 'incoming', so it counts toward income everywhere (Remaining, sealing, projecting,
 * clearing one-offs) — but Balance lists it under Overview, not the Extra Income section.
 */

/** Add and edit share one form; `income` present = editing it. */
function IncomeForm({ income, open, onClose }: { income?: ExtraIncome; open: boolean; onClose: () => void }) {
  const { addExtraIncome, updateExtraIncome, cycleMode } = useContext(AppDataContext);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel(income?.label ?? '');
    setAmount(income ? income.amount.toString() : '');
    setRecurring(income?.recurring ?? false);
    setError('');
  }, [open, income]);

  const handleSubmit = () => {
    if (!label.trim()) { setError('Title is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    if (income) updateExtraIncome(income.id, { label: label.trim(), amount: amt, recurring });
    else addExtraIncome(label.trim(), amt, recurring, 'incoming');
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{income ? 'Edit Income' : 'Add Income'}</DialogTitle>
        <DialogDescription className="sr-only">{income ? 'Edit this income entry.' : 'Track money coming in.'}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
          <Input placeholder="e.g., Freelance, Side job" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount</label>
          <Input type="number" inputMode="decimal" placeholder="e.g., 1000" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-sm font-semibold text-foreground">Recurring</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {recurring ? 'Counts every month until removed' : `Auto-removed ${clearsWhen(cycleMode)}`}
            </p>
          </div>
          <Switch checked={recurring} onCheckedChange={setRecurring} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter className="mt-2">
        <DialogClose asChild><Button variant="secondary" type="button">Cancel</Button></DialogClose>
        <Button onClick={handleSubmit}>{income ? 'Save' : 'Add Income'}</Button>
      </DialogFooter>
    </>
  );
}

function AddIncomeDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <IncomeForm open={open} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function IncomeRow({ income, onDelete }: { income: ExtraIncome; onDelete: (id: string) => void }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <SwipeableRow
        rightActions={[
          { icon: Pencil, label: 'Edit', onAction: () => setEditOpen(true) },
          { icon: Trash2, label: 'Delete', tone: 'destructive', onAction: () => onDelete(income.id) },
        ]}
      >
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-foreground truncate">{income.label}</span>
              {income.recurring && (
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0', 'bg-primary/15 text-primary')}>
                    <RefreshCw className="h-2.5 w-2.5" /> Recurring
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(income.amount)}</span>
              <button
                aria-label={`Edit ${income.label}`}
                onClick={() => setEditOpen(true)}
                className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={`Remove ${income.label}`}
                onClick={() => onDelete(income.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </SwipeableRow>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <IncomeForm income={income} open={editOpen} onClose={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IncomeList() {
  const { extraIncomes, deleteExtraIncome, restoreExtraIncome, cycleMode } = useContext(AppDataContext);
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();
  const incomes = useMemo(() => (extraIncomes ?? []).filter(e => e.kind === 'incoming'), [extraIncomes]);
  const [chartOpen, setChartOpen] = useState(false);

  // Delete immediately, offer a 5s undo window instead of a confirm dialog.
  const handleDelete = (id: string) => {
    const item = incomes.find(e => e.id === id);
    if (!item) return;
    confirmDelete({ title: `Delete "${item.label}"?` }, () => {
      deleteExtraIncome(id);
      showUndoToast(`Removed "${item.label}"`, () => restoreExtraIncome(item));
    });
  };

  const total = incomes.reduce((s, e) => s + e.amount, 0);
  const recurring = incomes.filter(e => e.recurring);
  const oneTime = incomes.filter(e => !e.recurring);

  return (
    <div className="space-y-3">
      {incomes.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-base">No income logged yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Tap the + button to log money coming in on top of your salary.</p>
            <p className="text-xs text-muted-foreground mt-1">Recurring income persists each month. One-time income clears {clearsWhen(cycleMode)}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-3 flex justify-between items-center gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Total Income</span>
                <button
                  aria-label="Show income breakdown"
                  onClick={() => setChartOpen(true)}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-lg font-bold text-positive tabular-nums">+{formatCurrency(total)}</span>
            </CardContent>
          </Card>
          <BreakdownDonutDialog
            open={chartOpen} onOpenChange={setChartOpen}
            items={incomes}
            title="Income breakdown" description="How this month's extra income splits up."
          />

          {recurring.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Recurring</p>
              {recurring.map(item => <IncomeRow key={item.id} income={item} onDelete={handleDelete} />)}
            </div>
          )}

          {oneTime.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">This month</p>
              {oneTime.map(item => <IncomeRow key={item.id} income={item} onDelete={handleDelete} />)}
            </div>
          )}
        </>
      )}

      {pathname === '/' && (
        <FixedPortal>
          <AddIncomeDialog>
            <button
              aria-label="Add income"
              className="fab-blurable fixed left-1/2 -translate-x-1/2 h-12 w-12 rounded-full focus:outline-none transition-transform hover:scale-105 z-40"
              style={{ bottom: 'calc(10px + var(--sab))', ...FAB_TOUCH_STYLE }}
              {...fabLongPress}
            >
              <FabPulse><Plus className="h-5 w-5" /></FabPulse>
            </button>
          </AddIncomeDialog>
        </FixedPortal>
      )}
    </div>
  );
}
