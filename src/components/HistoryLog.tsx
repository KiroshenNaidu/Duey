'use client';

import { useContext, useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HistoryEntry } from '@/lib/types';
import { Skeleton } from './ui/skeleton';
import { Check, Trophy } from 'lucide-react';

// HistoryEntry extended with a running balance for payment rows
type ProcessedHistoryEntry = HistoryEntry & { balanceAfter?: number };

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — small colored pill shown above each entry title
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_BADGE_CONFIG: Record<HistoryEntry['type'], { label: string; className: string }> = {
  payment:    { label: 'Payment',    className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  transport:  { label: 'Transport',  className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  creation:   { label: 'Created',    className: 'bg-muted text-muted-foreground' },
  completion: { label: 'Paid Off',   className: 'bg-amber-400/15 text-amber-600 dark:text-amber-400' },
  budget:     { label: 'Budget',     className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  expense:    { label: 'Expense',    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  employment: { label: 'Employment', className: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
  snapshot:   { label: 'Summary',   className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
};

function TypeBadge({ type }: { type: HistoryEntry['type'] }) {
  const { label, className } = TYPE_BADGE_CONFIG[type];
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none',
      className
    )}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Left-border accent color per entry type — gives each card a visual identity
// ─────────────────────────────────────────────────────────────────────────────

const ENTRY_BORDER: Record<HistoryEntry['type'], string> = {
  payment:    'border-l-green-500',
  transport:  'border-l-blue-500',
  creation:   'border-l-muted-foreground/30',
  completion: 'border-l-amber-400',
  budget:     'border-l-purple-500',
  expense:    'border-l-orange-500',
  employment: 'border-l-teal-500',
  snapshot:   'border-l-sky-500',
};

// ─────────────────────────────────────────────────────────────────────────────
// History item card
// ─────────────────────────────────────────────────────────────────────────────

function HistoryItem({ entry }: { entry: ProcessedHistoryEntry }) {
  const isCreation   = entry.type === 'creation';
  const isTransport  = entry.type === 'transport';
  const isPayment    = entry.type === 'payment';
  const isCompletion = entry.type === 'completion';
  const isBudget     = entry.type === 'budget';
  const isSnapshot   = entry.type === 'snapshot';

  const title = isCompletion
    ? `Paid Off: ${entry.debtTitle}`
    : entry.debtTitle;

  return (
    <div className={cn(
      'cv-auto rounded-lg border border-border/40 border-l-[3px] bg-card/40',
      ENTRY_BORDER[entry.type]
    )}>
      <div className="flex justify-between items-start px-3 py-2.5">

        {/* Left — badge, title, date, optional note */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="mb-0.5">
            <TypeBadge type={entry.type} />
          </div>
          <p className={cn('font-semibold text-sm text-foreground truncate', isCompletion && 'text-accent')}>
            {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(entry.date), 'PPP')}
          </p>
          {entry.note && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">
              {entry.note}
            </p>
          )}
        </div>

        {/* Right — amount styled per type, with optional remaining balance */}
        <div className="text-right shrink-0">
          {isCreation && (
            <p className="font-mono font-semibold text-sm text-foreground">
              {formatCurrency(entry.amount)}
            </p>
          )}
          {isTransport && (
            <p className="font-mono font-semibold text-sm text-red-500">
              -{formatCurrency(entry.amount)}
            </p>
          )}
          {isPayment && (
            <p className="font-mono font-semibold text-sm text-green-500 flex items-center justify-end gap-1">
              <Check className="h-4 w-4" />
              {formatCurrency(entry.amount)}
            </p>
          )}
          {isCompletion && (
            <p className="font-mono font-semibold text-sm text-accent flex items-center justify-end gap-1">
              <Trophy className="h-3.5 w-3.5" />
              {formatCurrency(entry.amount)}
            </p>
          )}
          {isBudget && (
            <p className="font-mono font-semibold text-sm text-muted-foreground">
              {formatCurrency(entry.amount)}
            </p>
          )}
          {isSnapshot && (
            <p className="font-mono font-semibold text-sm text-sky-500">
              {formatCurrency(entry.amount)}
            </p>
          )}

          {/* Remaining balance shown below payment amount */}
          {isPayment && entry.balanceAfter != null && (
            <p className="text-xs text-muted-foreground mt-1">
              Remaining: {formatCurrency(entry.balanceAfter)}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticky month header used in the "All" tab
// ─────────────────────────────────────────────────────────────────────────────

function MonthHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-2 py-1 border-b border-border">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function HistoryLog() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Derived data — memoised to avoid recomputing on every render
  const { debtProfiles, transportHistory, allHistory, chronologicalByDebtId } = useMemo(() => {
    // Newest first for display
    const allHistory = [...history].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Group debt-related entries by debt ID
    const byDebtId = allHistory
      .filter(h => h.debtId)
      .reduce((acc, h) => {
        if (h.debtId) (acc[h.debtId] = acc[h.debtId] || []).push(h);
        return acc;
      }, {} as Record<string, HistoryEntry[]>);

    const transportHistory = allHistory.filter(h => h.type === 'transport');
    const activeDebtIds = new Set(debts.map(d => d.id));

    // One profile per debt — active debts first, then alphabetical
    const debtProfiles = Object.entries(byDebtId).map(([debtId, entries]) => {
      const activeDept    = debts.find(d => d.id === debtId);
      const creationEntry = entries.find(e => e.type === 'creation');
      return {
        id:        debtId,
        title:     activeDept?.title ?? entries[0].debtTitle,
        totalOwed: activeDept?.total_owed ?? creationEntry?.amount ?? 0,
        archived:  !activeDebtIds.has(debtId),
      };
    }).sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return a.title.localeCompare(b.title);
    });

    // Oldest-first per debt (needed for running balance calculation)
    const chronologicalByDebtId: Record<string, HistoryEntry[]> = {};
    for (const [id, entries] of Object.entries(byDebtId)) {
      chronologicalByDebtId[id] = [...entries].reverse();
    }

    return { debtProfiles, transportHistory, allHistory, chronologicalByDebtId };
  }, [history, debts]);

  // Group all history by month for the "All" tab
  const monthGroups = useMemo(() => {
    const groups: { monthLabel: string; entries: HistoryEntry[] }[] = [];
    let currentMonth = '';
    for (const entry of allHistory) {
      const monthLabel = format(new Date(entry.date), 'MMMM yyyy');
      if (monthLabel !== currentMonth) {
        currentMonth = monthLabel;
        groups.push({ monthLabel, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [allHistory]);

  // ── Loading / empty states ─────────────────────────────────────────────────

  if (!isClient) {
    return (
      <Card>
        <CardContent className="p-2 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No payment history yet.
        </CardContent>
      </Card>
    );
  }

  const defaultTab = debtProfiles.length > 0
    ? debtProfiles[0].id
    : transportHistory.length > 0 ? 'transport' : 'all';

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardContent className="p-2">
        <Tabs defaultValue={defaultTab} className="w-full">

          {/* Tab triggers — one per debt, plus Transport and All */}
          <TabsList className="h-auto flex-wrap justify-start p-1 mb-2">
            {debtProfiles.map((profile) => (
              <TabsTrigger key={profile.id} value={profile.id} className={cn(profile.archived && 'opacity-60')}>
                {profile.title}
                {profile.archived && <span className="ml-1 text-[8px] text-accent">✓</span>}
              </TabsTrigger>
            ))}
            {transportHistory.length > 0 && <TabsTrigger value="transport">Transport</TabsTrigger>}
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          {/* Per-debt tab — shows entries newest-first with running balance */}
          {debtProfiles.map((profile) => {
            const entries = chronologicalByDebtId[profile.id] ?? [];
            let runningBalance = profile.totalOwed;

            // Walk oldest→newest tracking balance, then reverse for newest-first display
            const processedEntries: ProcessedHistoryEntry[] = entries
              .map(entry => {
                if (entry.type === 'creation') {
                  runningBalance = entry.amount;
                  return entry;
                }
                if (entry.type === 'payment') {
                  runningBalance = Math.max(0, runningBalance - entry.amount);
                  return { ...entry, balanceAfter: runningBalance };
                }
                return entry;
              })
              .reverse();

            return (
              <TabsContent key={profile.id} value={profile.id} className="m-0">
                <ScrollArea className="h-80 border rounded-md">
                  <div className="p-2 space-y-2">
                    {processedEntries.map(entry => <HistoryItem key={entry.id} entry={entry} />)}
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}

          {/* Transport tab */}
          {transportHistory.length > 0 && (
            <TabsContent value="transport" className="m-0">
              <ScrollArea className="h-80 border rounded-md">
                <div className="p-2 space-y-2">
                  {transportHistory.map(entry => <HistoryItem key={entry.id} entry={entry} />)}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* All tab — grouped by month with sticky headers */}
          <TabsContent value="all" className="m-0">
            <ScrollArea className="h-80 border rounded-md">
              <div>
                {monthGroups.map(group => (
                  <div key={group.monthLabel}>
                    <MonthHeader label={group.monthLabel} />
                    <div className="p-2 space-y-2">
                      {group.entries.map(entry => <HistoryItem key={entry.id} entry={entry} />)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

        </Tabs>
      </CardContent>
    </Card>
  );
}
