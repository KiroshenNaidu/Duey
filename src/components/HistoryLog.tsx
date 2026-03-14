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
import { Check } from 'lucide-react';
import { getAmountPaid } from '@/lib/calculations';

type ProcessedHistoryEntry = HistoryEntry & { balanceAfter?: number };

function HistoryItem({ entry }: { entry: ProcessedHistoryEntry }) {
    const isCreation = entry.type === 'creation';
    const isTransport = entry.type === 'transport';
    const isPayment = entry.type === 'payment';

    const title = isCreation ? 'Initial Debt'
                : isTransport ? entry.debtTitle
                : isPayment ? entry.debtTitle
                : 'Installment Logged';

    return (
        <div className="flex justify-between items-start p-3">
            <div>
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.date), "PPP")}
                </p>
            </div>

            <div className="text-right">
                {isCreation && (
                    <p className="font-mono font-semibold text-sm text-foreground">
                        {formatCurrency(entry.amount)}
                    </p>
                )}
                {isTransport && (
                    <p className="font-mono font-semibold text-sm text-destructive">
                        -{formatCurrency(entry.amount)}
                    </p>
                )}
                {isPayment && (
                    <p className="font-mono font-semibold text-sm text-green-500 flex items-center justify-end gap-1">
                        <Check className="h-4 w-4" />
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

  const { debtsWithHistory, transportHistory, allHistory } = useMemo(() => {
    const allHistory = [...history].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const debtHistoryItems = allHistory.filter(h => h.debtId);
    const transportHistory = allHistory.filter(h => h.type === 'transport');

    const historyByDebtId = debtHistoryItems.reduce((acc, entry) => {
        if(entry.debtId) {
            (acc[entry.debtId] = acc[entry.debtId] || []).push(entry);
        }
        return acc;
    }, {} as Record<string, HistoryEntry[]>);
    
    const debtsWithHistory = debts
        .filter(debt => historyByDebtId[debt.id] && historyByDebtId[debt.id].length > 0)
        .sort((a,b) => a.title.localeCompare(b.title));

    return { debtsWithHistory, transportHistory, allHistory };
  }, [history, debts]);

  if (!isClient) {
    return (
        <Card>
            <CardContent className="p-4 space-y-2">
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

  const defaultTab = debtsWithHistory.length > 0 ? debtsWithHistory[0].id : transportHistory.length > 0 ? 'transport' : 'all';

  return (
    <Card>
      <CardContent className="p-4">
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="h-auto flex-wrap justify-start p-1 mb-2">
            {debtsWithHistory.map((debt) => (
              <TabsTrigger key={debt.id} value={debt.id}>
                {debt.title}
              </TabsTrigger>
            ))}
            {transportHistory.length > 0 && <TabsTrigger value="transport">Transport</TabsTrigger>}
             <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
            
          {debtsWithHistory.map((debt) => {
             const debtChronologicalHistory = history
                .filter(h => h.debtId === debt.id)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            let runningBalance = debt.total_owed;
            
            const processedHistory: ProcessedHistoryEntry[] = debtChronologicalHistory
                .map(entry => {
                    let balanceAfter: number | undefined = undefined;
                    if (entry.type === 'payment') {
                        balanceAfter = runningBalance - entry.amount;
                        runningBalance = balanceAfter;
                        return { ...entry, balanceAfter: Math.max(0, balanceAfter) };
                    }
                    if (entry.type === 'creation') {
                        runningBalance = entry.amount;
                        // For creation, we can calculate the balance after all payments
                        const totalPaid = getAmountPaid(debt, history);
                        balanceAfter = debt.total_owed - totalPaid;
                    }
                    return entry;
                })
                .reverse();

            return (
              <TabsContent key={debt.id} value={debt.id} className="m-0">
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
