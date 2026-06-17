'use client';

import { useContext, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft, Pencil, Trash2, Check, X,
  CreditCard, PlusCircle, Trophy, Car, Wallet, Zap, Receipt,
} from 'lucide-react';
import type { HistoryEntry } from '@/lib/types';

const TYPE_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  payment:    { label: 'Payment',   Icon: CreditCard,  color: 'text-primary',          bg: 'bg-primary/15' },
  creation:   { label: 'Created',   Icon: PlusCircle,  color: 'text-muted-foreground', bg: 'bg-muted/80' },
  completion: { label: 'Completed', Icon: Trophy,      color: 'text-green-500',        bg: 'bg-green-500/15' },
  transport:  { label: 'Transport', Icon: Car,         color: 'text-blue-400',         bg: 'bg-blue-400/15' },
  budget:     { label: 'Budget',    Icon: Wallet,      color: 'text-purple-400',       bg: 'bg-purple-400/15' },
};

const INTEREST_CONFIG = { label: 'Interest', Icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/15' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ type, isInterest, customLabel }: { type: string; isInterest: boolean; customLabel?: string }) {
  const cfg = isInterest && !customLabel ? INTEREST_CONFIG : (TYPE_CONFIG[type] ?? TYPE_CONFIG.payment);
  const { Icon, color, bg } = cfg;
  const label = customLabel ?? cfg.label;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full', bg, color)}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function EntryRow({
  entry,
  isInterest,
  onUpdate,
  onDelete,
}: {
  entry: HistoryEntry;
  isInterest: boolean;
  onUpdate: (id: string, data: { label?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(entry.label ?? '');

  const save = () => {
    onUpdate(entry.id, { label: draftLabel.trim() || undefined });
    setEditing(false);
  };

  const cancel = () => {
    setDraftLabel(entry.label ?? '');
    setEditing(false);
  };

  const canEdit = entry.type === 'payment';

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border/30 last:border-0">
      {/* Badge / edit input */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
            className="h-8 text-sm w-44"
            autoFocus
            placeholder="e.g. Interest, Penalty"
          />
        ) : (
          <TypeBadge type={entry.type} isInterest={isInterest} customLabel={entry.label} />
        )}
        <p className="text-xs text-muted-foreground mt-1.5">{formatDate(entry.date)}</p>
        {entry.note && (
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{entry.note}</p>
        )}
      </div>

      {/* Amount */}
      <span className={cn(
        'text-sm font-bold tabular-nums shrink-0',
        isInterest && !entry.label ? 'text-amber-400' : '',
      )}>
        {formatCurrency(entry.amount)}
      </span>

      {/* Actions — always visible for touch */}
      <div className="flex items-center gap-0.5 shrink-0">
        {editing ? (
          <>
            <button
              onClick={save}
              className="p-2.5 rounded-xl text-green-500 active:bg-green-500/10 transition-colors"
            >
              <Check size={16} />
            </button>
            <button
              onClick={cancel}
              className="p-2.5 rounded-xl text-muted-foreground active:bg-muted transition-colors"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="p-2.5 rounded-xl text-muted-foreground/50 active:bg-muted active:text-muted-foreground transition-colors"
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              onClick={() => onDelete(entry.id)}
              className="p-2.5 rounded-xl text-muted-foreground/40 active:bg-destructive/10 active:text-destructive transition-colors"
            >
              <Trash2 size={14} />
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

  const { grouped, hasInterestEntries } = useMemo(() => {
    const debtTotals: Record<string, number> = {};
    debts.forEach(d => { debtTotals[d.id ?? ''] = d.total_owed; });

    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const running: Record<string, number> = {};
    let hasInterest = false;

    const enriched = sorted.map(entry => {
      if (entry.type !== 'payment' || !entry.debtId) return { entry, isInterest: false };
      running[entry.debtId] = (running[entry.debtId] ?? 0) + entry.amount;
      const isInterest = running[entry.debtId] > (debtTotals[entry.debtId] ?? Infinity);
      if (isInterest) hasInterest = true;
      return { entry, isInterest };
    });

    const groups = new Map<string, { entry: HistoryEntry; isInterest: boolean }[]>();
    enriched.reverse().forEach(item => {
      const key = item.entry.debtTitle;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    return { grouped: Array.from(groups.entries()), hasInterestEntries: hasInterest };
  }, [history, debts]);

  const paymentEntries = history.filter(h => h.type === 'payment');
  const totalPaid = paymentEntries.reduce((s, h) => s + h.amount, 0);

  return (
    <div className="container mx-auto max-w-md pt-12 pb-10 px-4">
      {/* Header */}
      <div className="relative flex items-center justify-center pb-5">
        <button
          onClick={() => router.back()}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-2.5 rounded-full active:bg-secondary transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold">History</h1>
          <p className="text-xs text-muted-foreground">All transactions & events</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="bg-card rounded-2xl p-4 text-center col-span-2">
          <p className="text-xl font-black text-primary">{formatCurrency(totalPaid)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Total Paid</p>
        </div>
        <div className="bg-card rounded-2xl p-4 text-center">
          <p className="text-xl font-black">{paymentEntries.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Payments</p>
        </div>
      </div>

      {/* Interest note — only shown when relevant */}
      {hasInterestEntries && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3.5 mb-4">
          <Zap size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-400/90 leading-relaxed">
            <span className="font-semibold">Interest entries</span> are payments made after the debt total was reached.
            Tap <Pencil size={10} className="inline mx-0.5 mb-0.5" /> on any payment to rename it.
          </p>
        </div>
      )}

      {grouped.length === 0 && (
        <div className="flex flex-col items-center justify-center mt-24 gap-3 text-muted-foreground">
          <Receipt size={48} className="opacity-20" />
          <p className="text-sm">No history yet</p>
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(([debtTitle, items]) => {
          const groupTotal = items
            .filter(i => i.entry.type === 'payment')
            .reduce((s, i) => s + i.entry.amount, 0);

          return (
            <Card key={debtTitle} className="overflow-hidden">
              <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {debtTitle}
                </p>
                {groupTotal > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {formatCurrency(groupTotal)} paid
                  </p>
                )}
              </div>
              <CardContent className="px-4 pb-2 pt-0">
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
          );
        })}
      </div>
    </div>
  );
}
