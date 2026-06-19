'use client';

import { useContext, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { calculateTransportMonth } from '@/lib/calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, Plus, Trash2, X } from 'lucide-react';

export function MoneyOverview() {
  const {
    monthlyIncome, debts, budgetPlans, expenses, extraIncomes,
    transportSettings, transportOverrides,
    setMonthlyIncome, addExtraIncome, deleteExtraIncome,
  } = useContext(AppDataContext);

  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const toggleExclude = (id: string) =>
    setExcludedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Extra income add form
  const [addingExtra, setAddingExtra] = useState(false);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraError, setExtraError] = useState('');

  const now = new Date();
  const transportCost = calculateTransportMonth(now, transportOverrides, transportSettings).totalDue;
  const budgetSpent = budgetPlans.flatMap(p => p.items).reduce((s, i) => s + i.price, 0);
  const debtInstallments = debts.reduce((s, d) => s + d.installment_amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalExtra = (extraIncomes ?? []).reduce((s, e) => s + e.amount, 0);
  const totalDeductions = transportCost + budgetSpent + debtInstallments + totalExpenses;
  // Effective totals exclude tapped-out rows (local state only — no data is changed)
  const effectiveDeductions = [transportCost, budgetSpent, debtInstallments, totalExpenses]
    .filter((_, i) => !excludedIds.has(['transport', 'budget', 'debts', 'expenses'][i]))
    .reduce((s, v) => s + v, 0);
  const remaining = monthlyIncome + totalExtra - effectiveDeductions;

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
    addExtraIncome(extraLabel.trim(), amt);
    setExtraLabel(''); setExtraAmount(''); setExtraError(''); setAddingExtra(false);
  };

  const deductions = [
    { id: 'transport', label: 'Transport (this month)', value: transportCost },
    { id: 'budget',    label: 'Budget (all plans)',     value: budgetSpent },
    { id: 'debts',     label: 'Debt installments',      value: debtInstallments },
    { id: 'expenses',  label: 'Expenses (active)',       value: totalExpenses },
  ];

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
              <button onClick={confirmEdit} className="p-2 rounded-full bg-accent text-accent-foreground shrink-0">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={startEdit} className="flex items-center gap-2 group w-full text-left">
              <span className="text-2xl font-bold text-foreground">
                {monthlyIncome > 0 ? formatCurrency(monthlyIncome) : 'Set income'}
              </span>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </CardContent>
      </Card>

      {/* Extra Income */}
      <Card>
        <CardContent className="p-3 space-y-2">
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
              <span className="text-xs text-foreground truncate flex-1">{item.label}</span>
              <span className="text-xs font-semibold text-primary tabular-nums shrink-0">+{formatCurrency(item.amount)}</span>
              <button
                onClick={() => deleteExtraIncome(item.id)}
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
              {extraError && <p className="text-[10px] text-destructive">{extraError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={submitExtra} className="flex-1 h-7 text-xs">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingExtra(false); setExtraLabel(''); setExtraAmount(''); setExtraError(''); }} className="h-7 text-xs px-2">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {totalExtra > 0 && (
            <div className="flex justify-between items-baseline border-t border-border/40 pt-2 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Extra</span>
              <span className="text-sm font-bold text-primary tabular-nums">+{formatCurrency(totalExtra)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deductions</p>
          {deductions.map(d => {
            const off = excludedIds.has(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggleExclude(d.id)}
                className={cn('flex justify-between items-baseline w-full text-left transition-opacity', off && 'opacity-35')}
              >
                <span className={cn('text-xs text-muted-foreground', off && 'line-through')}>{d.label}</span>
                <span className={cn('text-sm font-semibold text-foreground tabular-nums', off && 'line-through')}>
                  {d.value > 0 ? `−${formatCurrency(d.value)}` : formatCurrency(0)}
                </span>
              </button>
            );
          })}
          <div className="border-t border-border pt-2 mt-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total deductions</span>
              <span className="text-sm font-bold text-foreground tabular-nums">−{formatCurrency(effectiveDeductions)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remaining */}
      <Card className={cn('border-2', remaining >= 0 ? 'border-accent/40' : 'border-destructive/40')}>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Remaining</p>
          <p className={cn('text-3xl font-bold tabular-nums', remaining >= 0 ? 'text-accent' : 'text-destructive')}>
            {remaining < 0 ? `−${formatCurrency(Math.abs(remaining))}` : formatCurrency(remaining)}
          </p>
          {remaining < 0 && <p className="text-[10px] text-destructive mt-0.5">You&apos;re over budget this month</p>}
          {monthlyIncome === 0 && <p className="text-[10px] text-muted-foreground mt-0.5">Set your monthly income above to see your balance</p>}
        </CardContent>
      </Card>
    </div>
  );
}
