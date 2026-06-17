'use client';

import { useContext, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Pencil, Trash2, Check, X } from 'lucide-react';
import type { HistoryEntry } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = {
  payment: 'Payment',
  creation: 'Created',
  completion: 'Completed',
  transport: 'Transport',
  budget: 'Budget',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function EntryRow({
  entry,
  isInterest,
  onUpdate,
  onDelete,
}: {
  entry: HistoryEntry;
  isInterest: boolean;
  onUpdate: (id: string, data: { label?: string; note?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(entry.label ?? (isInterest ? 'Interest' : ''));

  const displayLabel = entry.label ?? (isInterest ? 'Interest' : TYPE_LABELS[entry.type] ?? entry.type);

  const save = () => {
    onUpdate(entry.id, { label: draftLabel.trim() || undefined });
    setEditing(false);
  };

  const cancel = () => {
    setDraftLabel(entry.label ?? (isInterest ? 'Interest' : ''));
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {editing ? (
            <Input
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
              className="h-7 text-xs w-36"
              autoFocus
            />
          ) : (
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              isInterest && !entry.label
                ? 'bg-amber-500/15 text-amber-400'
                : entry.type === 'payment'
                ? 'bg-primary/15 text-primary'
                : entry.type === 'completion'
                ? 'bg-green-500/15 text-green-500'
                : 'bg-muted text-muted-foreground'
            )}>
              {displayLabel}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{formatDate(entry.date)}</span>
        </div>
        {entry.note && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{entry.note}</p>
        )}
      </div>

      <span className="text-sm font-semibold tabular-nums shrink-0">
        {formatCurrency(entry.amount)}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button onClick={save} className="p-1 text-accent hover:text-accent/80 transition-colors"><Check size={14} /></button>
            <button onClick={cancel} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
          </>
        ) : (
          <>
            {entry.type === 'payment' && (
              <button onClick={() => setEditing(true)} className="p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                <Pencil size={13} />
              </button>
            )}
            <button onClick={() => onDelete(entry.id)} className="p-1 text-muted-foreground/40 hover:text-destructive transition-colors">
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const { history, debts, updateHistoryEntry, deleteHistoryEntry } = useContext(AppDataContext);

  // Group payment history by debt, calculate running totals to detect interest
  const grouped = useMemo(() => {
    const debtTotals: Record<string, number> = {};
    debts.forEach(d => { debtTotals[d.id ?? ''] = d.total_owed; });

    // Process entries oldest-first so we can track running totals
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const running: Record<string, number> = {};
    const enriched = sorted.map(entry => {
      if (entry.type !== 'payment' || !entry.debtId) {
        return { entry, isInterest: false };
      }
      running[entry.debtId] = (running[entry.debtId] ?? 0) + entry.amount;
      const totalOwed = debtTotals[entry.debtId] ?? Infinity;
      const isInterest = running[entry.debtId] > totalOwed;
      return { entry, isInterest };
    });

    // Re-sort newest-first and group by debtTitle
    const groups = new Map<string, { entry: HistoryEntry; isInterest: boolean }[]>();
    enriched.reverse().forEach(item => {
      const key = item.entry.debtTitle;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    return Array.from(groups.entries());
  }, [history, debts]);

  const paymentEntries = history.filter(h => h.type === 'payment');
  const totalPaid = paymentEntries.reduce((s, h) => s + h.amount, 0);

  return (
    <div className="container mx-auto max-w-md pt-11 pb-8">
      {/* Header */}
      <div className="relative flex items-center justify-center pb-4">
        <button
          onClick={() => router.back()}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-secondary"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold">Payment History</h1>
      </div>

      {/* Summary pill */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-card rounded-2xl p-3 text-center">
          <p className="text-lg font-black text-primary">{formatCurrency(totalPaid)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Total Paid</p>
        </div>
        <div className="flex-1 bg-card rounded-2xl p-3 text-center">
          <p className="text-lg font-black">{paymentEntries.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Payments</p>
        </div>
      </div>

      {/* Interest note */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 mb-4 text-xs text-amber-400/90">
        <span className="font-semibold">Interest entries</span> are payments made after the debt total was reached. Tap <Pencil size={11} className="inline mx-0.5 mb-0.5" /> on any payment to rename it.
      </div>

      {grouped.length === 0 && (
        <p className="text-center text-muted-foreground text-sm mt-8">No payment history yet.</p>
      )}

      <div className="space-y-3">
        {grouped.map(([debtTitle, items]) => (
          <Card key={debtTitle} className="overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{debtTitle}</p>
            </div>
            <CardContent className="px-4 pb-3 pt-0">
              {items.map(({ entry, isInterest }) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  isInterest={isInterest}
                  onUpdate={updateHistoryEntry}
                  onDelete={deleteHistoryEntry}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
