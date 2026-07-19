'use client';

import { useContext, useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { HistoryEntry } from '@/lib/types';
import { Skeleton } from './ui/skeleton';
import { Check, Trophy, ChevronDown, ChevronUp } from 'lucide-react';

// HistoryEntry extended with a running balance for payment rows
type ProcessedHistoryEntry = HistoryEntry & { balanceAfter?: number };

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — small colored pill shown above each entry title
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_BADGE_CONFIG: Record<HistoryEntry['type'], { label: string; className: string }> = {
  payment:    { label: 'Payment',    className: 'bg-positive/15 text-positive' },
  transport:  { label: 'Transport',  className: 'bg-transport/15 text-transport' },
  creation:   { label: 'Created',    className: 'bg-muted text-muted-foreground' },
  completion: { label: 'Paid Off',   className: 'bg-completion/15 text-completion' },
  budget:     { label: 'Budget',     className: 'bg-budget/15 text-budget' },
  expense:    { label: 'Expense',    className: 'bg-expense/15 text-expense' },
  employment: { label: 'Employment', className: 'bg-employment/15 text-employment' },
  snapshot:   { label: 'Summary',   className: 'bg-snapshot/15 text-snapshot' },
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
  payment:    'border-l-positive',
  transport:  'border-l-transport',
  creation:   'border-l-muted-foreground/30',
  completion: 'border-l-completion',
  budget:     'border-l-budget',
  expense:    'border-l-expense',
  employment: 'border-l-employment',
  snapshot:   'border-l-snapshot',
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
          {entry.person && (
            <p className="text-[10px] text-muted-foreground truncate">to {entry.person}</p>
          )}
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
            <p className="font-mono font-semibold text-sm text-snapshot">
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

function MonthHeader({ label, isCurrent }: { label: string; isCurrent?: boolean }) {
  return (
    <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-2 py-1 border-b border-border flex items-center justify-between gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {isCurrent && (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-primary shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Live · finalizes month-end
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function HistoryLog() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Derived data — memoised to avoid recomputing on every render
  const { debtProfiles, transportHistory, allHistory, chronologicalByDebtId } = useMemo(() => {
    const allHistory = [...history]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
      const person        = activeDept?.person ?? creationEntry?.person;
      const baseTitle     = activeDept?.title ?? entries[0].debtTitle;
      return {
        id:        debtId,
        // Filter chips name both what the debt is for and who it's owed to.
        title:     person?.trim() ? `${baseTitle} · ${person.trim()}` : baseTitle,
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

  // Build ordered tab list — All always first
  const allTabs = [
    { value: 'all', label: 'All', archived: false },
    ...debtProfiles.map(p => ({ value: p.id, label: p.title, archived: p.archived })),
    ...(transportHistory.length > 0 ? [{ value: 'transport', label: 'Transport', archived: false }] : []),
  ];

  const activeLabel = allTabs.find(t => t.value === activeTab)?.label ?? 'All';
  const activeArchived = allTabs.find(t => t.value === activeTab)?.archived ?? false;

  const handleChipClick = (value: string) => {
    if (value === activeTab) {
      setIsExpanded(prev => !prev);
    } else {
      setActiveTab(value);
      setIsExpanded(false);
    }
  };

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardContent className="p-2">
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setIsExpanded(false); }} className="w-full">

          {/* Collapsible filter bar */}
          <div className="mb-2">
            {isExpanded ? (
              /* Expanded — show all chips */
              <div className="flex flex-wrap gap-1 p-1 bg-card border border-border rounded-xl">
                {allTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => handleChipClick(tab.value)}
                    className={cn(
                      "inline-flex items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                      activeTab === tab.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      tab.archived && "opacity-60"
                    )}
                  >
                    {tab.label}
                    {tab.archived && <span className="ml-1 text-[8px] text-accent">✓</span>}
                    {activeTab === tab.value && (
                      <ChevronUp className="ml-1 h-3 w-3 opacity-70" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              /* Collapsed — show only active chip */
              <div className="flex items-center p-1">
                <button
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground shadow-sm transition-all",
                    activeArchived && "opacity-60"
                  )}
                >
                  {activeLabel}
                  {activeArchived && <span className="ml-1 text-[8px] text-accent">✓</span>}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
              </div>
            )}
          </div>

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
                    <MonthHeader label={group.monthLabel} isCurrent={group.monthLabel === format(new Date(), 'MMMM yyyy')} />
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
