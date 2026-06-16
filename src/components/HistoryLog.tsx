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

type ProcessedHistoryEntry = HistoryEntry & { balanceAfter?: number };

function HistoryItem({ entry }: { entry: ProcessedHistoryEntry }) {
    const isCreation = entry.type === 'creation';
    const isTransport = entry.type === 'transport';
    const isPayment = entry.type === 'payment';
    const isCompletion = entry.type === 'completion';
    const isBudget = entry.type === 'budget';

    const title = isCreation ? 'Initial Debt'
                : isCompletion ? `Paid Off: ${entry.debtTitle}`
                : isBudget ? entry.debtTitle
                : entry.debtTitle;

    return (
        <div className="flex justify-between items-start p-2">
            <div className="flex-1 min-w-0 pr-2">
                <p className={cn("font-semibold text-sm text-foreground truncate", isCompletion && "text-accent")}>{title}</p>
                <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.date), "PPP")}
                </p>
            </div>

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

                {isPayment && entry.balanceAfter !== undefined && entry.balanceAfter !== null && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Remaining: {formatCurrency(entry.balanceAfter)}
                    </p>
                )}
            </div>
        </div>
    );
}


export function HistoryLog() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { debtProfiles, transportHistory, allHistory, chronologicalByDebtId } = useMemo(() => {
    const allHistory = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Group history entries that have a debtId
    const byDebtId = allHistory
      .filter(h => h.debtId)
      .reduce((acc, h) => {
        if (h.debtId) (acc[h.debtId] = acc[h.debtId] || []).push(h);
        return acc;
      }, {} as Record<string, HistoryEntry[]>);

    const transportHistory = allHistory.filter(h => h.type === 'transport');

    const activeDebtIds = new Set(debts.map(d => d.id));

    // Build unified list: active debts first, then archived (completed/deleted)
    const debtProfiles = Object.entries(byDebtId).map(([debtId, entries]) => {
      const activeDept = debts.find(d => d.id === debtId);
      const creationEntry = entries.find(e => e.type === 'creation');
      const totalOwed = activeDept?.total_owed ?? creationEntry?.amount ?? 0;
      const isArchived = !activeDebtIds.has(debtId);
      return {
        id: debtId,
        title: activeDept?.title ?? entries[0].debtTitle,
        totalOwed,
        archived: isArchived,
      };
    }).sort((a, b) => {
      // Active debts before archived
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return a.title.localeCompare(b.title);
    });

    const chronologicalByDebtId: Record<string, HistoryEntry[]> = {};
    for (const [id, entries] of Object.entries(byDebtId)) {
      chronologicalByDebtId[id] = [...entries].reverse();
    }

    return { debtProfiles, transportHistory, allHistory, chronologicalByDebtId };
  }, [history, debts]);

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

  return (
    <Card>
      <CardContent className="p-2">
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="h-auto flex-wrap justify-start p-1 mb-2">
            {debtProfiles.map((profile) => (
              <TabsTrigger key={profile.id} value={profile.id} className={cn(profile.archived && "opacity-60")}>
                {profile.title}
                {profile.archived && <span className="ml-1 text-[8px] text-accent">✓</span>}
              </TabsTrigger>
            ))}
            {transportHistory.length > 0 && <TabsTrigger value="transport">Transport</TabsTrigger>}
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          {debtProfiles.map((profile) => {
            const debtChronologicalHistory = chronologicalByDebtId[profile.id] ?? [];

            let runningBalance = profile.totalOwed;

            const processedHistory: ProcessedHistoryEntry[] = debtChronologicalHistory
              .map(entry => {
                if (entry.type === 'payment') {
                  runningBalance = runningBalance - entry.amount;
                  return { ...entry, balanceAfter: Math.max(0, runningBalance) };
                }
                if (entry.type === 'creation') {
                  runningBalance = entry.amount;
                }
                return entry;
              })
              .reverse();

            return (
              <TabsContent key={profile.id} value={profile.id} className="m-0">
                <ScrollArea className="h-64 border rounded-md">
                  <div className="p-1 space-y-1 divide-y divide-border">
                    {processedHistory.map((entry) => <HistoryItem key={entry.id} entry={entry} />)}
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}

          {transportHistory.length > 0 && (
            <TabsContent value="transport" className="m-0">
              <ScrollArea className="h-64 border rounded-md">
                <div className="p-1 space-y-1 divide-y divide-border">
                  {transportHistory.map((entry) => <HistoryItem key={entry.id} entry={entry} />)}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          <TabsContent value="all" className="m-0">
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-1 space-y-1 divide-y divide-border">
                {allHistory.map((entry) => <HistoryItem key={entry.id} entry={entry} />)}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
