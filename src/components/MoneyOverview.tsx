'use client';

import { useContext, useState } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { calculateTransportMonth } from '@/lib/calculations';
import { isSameMonth } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pencil, Check } from 'lucide-react';

export function MoneyOverview() {
  const {
    monthlyIncome,
    history,
    budgetPlans,
    transportSettings,
    transportOverrides,
    setMonthlyIncome,
  } = useContext(AppDataContext);

  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');

  const now = new Date();

  const transportCost = calculateTransportMonth(now, transportOverrides, transportSettings).totalDue;

  const budgetSpent = budgetPlans.flatMap(p => p.items).reduce((s, i) => s + i.price, 0);

  const debtPaymentsThisMonth = history
    .filter(h => h.type === 'payment' && isSameMonth(new Date(h.date), now))
    .reduce((s, h) => s + h.amount, 0);

  const totalDeductions = transportCost + budgetSpent + debtPaymentsThisMonth;
  const remaining = monthlyIncome - totalDeductions;

  const startEdit = () => {
    setIncomeInput(monthlyIncome > 0 ? monthlyIncome.toString() : '');
    setEditingIncome(true);
  };

  const confirmEdit = () => {
    const val = parseFloat(incomeInput);
    if (!isNaN(val) && val >= 0) setMonthlyIncome(val);
    setEditingIncome(false);
  };

  const deductions = [
    { label: 'Transport (this month)', value: transportCost },
    { label: 'Budget spent (all plans)', value: budgetSpent },
    { label: 'Debt payments (this month)', value: debtPaymentsThisMonth },
  ];

  return (
    <div className="space-y-3">
      {/* Income */}
      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Monthly Income</p>
          {editingIncome ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="e.g., 15000"
                value={incomeInput}
                onChange={e => setIncomeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmEdit()}
                autoFocus
                className="text-base font-bold"
              />
              <button
                onClick={confirmEdit}
                className="p-2 rounded-full bg-accent text-accent-foreground shrink-0"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-2 group w-full text-left"
            >
              <span className="text-2xl font-bold text-foreground">
                {monthlyIncome > 0 ? formatCurrency(monthlyIncome) : 'Set income'}
              </span>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deductions</p>
          {deductions.map(d => (
            <div key={d.label} className="flex justify-between items-baseline">
              <span className="text-xs text-muted-foreground">{d.label}</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {d.value > 0 ? `−${formatCurrency(d.value)}` : formatCurrency(0)}
              </span>
            </div>
          ))}

          <div className="border-t border-border pt-2 mt-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total deductions</span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                −{formatCurrency(totalDeductions)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remaining */}
      <Card className={cn(
        'border-2',
        remaining >= 0 ? 'border-accent/40' : 'border-destructive/40'
      )}>
        <CardContent className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Remaining</p>
          <p className={cn(
            'text-3xl font-bold tabular-nums',
            remaining >= 0 ? 'text-accent' : 'text-destructive'
          )}>
            {formatCurrency(Math.abs(remaining))}
          </p>
          {remaining < 0 && (
            <p className="text-[10px] text-destructive mt-0.5">You're over budget this month</p>
          )}
          {monthlyIncome === 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">Set your monthly income above to see your balance</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
