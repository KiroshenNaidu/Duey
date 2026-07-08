'use client';

import { useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import { Plus, Trash2, RefreshCw, Pencil } from 'lucide-react';
import { FixedPortal } from '@/components/FixedPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFabLongPress, FAB_TOUCH_STYLE, FabPulse } from '@/components/QuickAdd';
import { showUndoToast } from '@/components/ui/undo-toast';

function AddExpenseDialog({ children }: { children: React.ReactNode }) {
  const { addExpense } = useContext(AppDataContext);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setTitle(''); setAmount(''); setNote(''); setRecurring(false); setError(''); };

  const handleSubmit = () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    const today = new Date();
    addExpense({
      title: title.trim(),
      amount: amt,
      date: today.toISOString(),
      note: note.trim() || undefined,
      recurring,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription className="sr-only">Track a new expense.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <Input placeholder="e.g., WiFi, Electricity" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount</label>
            <Input type="number" placeholder="e.g., 1000" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
            <Input placeholder="Optional note" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-3">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-sm font-semibold text-foreground">Recurring</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {recurring
                  ? 'Stays active every month until manually removed'
                  : 'Auto-removed on the 1st of the next month'}
              </p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mt-2">
          <DialogClose asChild><Button variant="secondary" type="button">Cancel</Button></DialogClose>
          <Button onClick={handleSubmit}>Add Expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesList() {
  const { expenses, deleteExpense, restoreExpense } = useContext(AppDataContext);
  const pathname = usePathname();
  const fabLongPress = useFabLongPress();

  // Delete immediately, offer a 5s undo window instead of a confirm dialog.
  const handleDelete = (id: string) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    deleteExpense(id);
    showUndoToast(`Removed "${expense.title}"`, () => restoreExpense(expense));
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const recurring = expenses.filter(e => e.recurring);
  const oneTime = expenses.filter(e => !e.recurring);

  return (
    <div className="space-y-3">
      {expenses.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-base">No expenses yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Tap the + button to log one.</p>
            <p className="text-xs text-muted-foreground mt-1">Recurring expenses persist each month. One-time expenses auto-clear on the 1st.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-3 flex justify-between items-baseline">
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Total Expenses</span>
              <span className="text-lg font-bold text-destructive tabular-nums">−{formatCurrency(total)}</span>
            </CardContent>
          </Card>

          {/* Recurring */}
          {recurring.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Recurring</p>
              {recurring.map(expense => (
                <ExpenseRow key={expense.id} expense={expense} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* One-time */}
          {oneTime.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">This month</p>
              {oneTime.map(expense => (
                <ExpenseRow key={expense.id} expense={expense} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {pathname === '/' && (
        <FixedPortal>
          <AddExpenseDialog>
            <button
              aria-label="Add expense"
              className="fab-blurable fixed left-1/2 -translate-x-1/2 h-12 w-12 rounded-full focus:outline-none transition-transform hover:scale-105 z-40"
              style={{ bottom: 'calc(10px + var(--sab))', ...FAB_TOUCH_STYLE }}
              {...fabLongPress}
            >
              <FabPulse><Plus className="h-5 w-5" /></FabPulse>
            </button>
          </AddExpenseDialog>
        </FixedPortal>
      )}
    </div>
  );
}

function EditExpenseDialog({ expense, open, onClose }: { expense: import('@/lib/types').Expense; open: boolean; onClose: () => void }) {
  const { updateExpense } = useContext(AppDataContext);
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [note, setNote] = useState(expense.note ?? '');
  const [recurring, setRecurring] = useState(expense.recurring ?? false);
  const [error, setError] = useState('');

  // Reset to latest expense values whenever the dialog opens
  useEffect(() => {
    if (open) {
      setTitle(expense.title);
      setAmount(expense.amount.toString());
      setNote(expense.note ?? '');
      setRecurring(expense.recurring ?? false);
      setError('');
    }
  }, [open, expense]);

  const handleSave = () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid positive amount.'); return; }
    updateExpense(expense.id, { title: title.trim(), amount: amt, note: note.trim() || undefined, recurring });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription className="sr-only">Edit this expense entry.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount</label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
            <Input placeholder="Optional note" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-3">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-sm font-semibold text-foreground">Recurring</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {recurring ? 'Stays active every month until removed' : 'Auto-removed on the 1st of next month'}
              </p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseRow({ expense, onDelete }: { expense: import('@/lib/types').Expense; onDelete: (id: string) => void }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <Card>
        <CardContent className="p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">{expense.title}</span>
              {expense.recurring && (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', 'bg-primary/15 text-primary')}>
                  <RefreshCw className="h-2.5 w-2.5" /> Recurring
                </span>
              )}
            </div>
            {expense.note && <p className="text-xs text-muted-foreground mt-0.5">{expense.note}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(expense.amount)}</span>
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {/* Immediate delete — the global undo toast gives a 5s recovery window */}
            <button
              onClick={() => onDelete(expense.id)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardContent>
      </Card>
      <EditExpenseDialog expense={expense} open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  );
}
