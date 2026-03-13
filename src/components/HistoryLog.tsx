'use client';

import { useContext, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HistoryEntry } from '@/lib/types';
import { Skeleton } from './ui/skeleton';

export function HistoryLog() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

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

  const historyByDebtId = history.reduce((acc, entry) => {
      (acc[entry.debtId] = acc[entry.debtId] || []).push(entry);
      return acc;
  }, {} as Record<string, HistoryEntry[]>);

  const debtsWithHistory = debts
    .filter(debt => historyByDebtId[debt.id] && historyByDebtId[debt.id].length > 0)
    .sort((a,b) => a.title.localeCompare(b.title));

  if (debtsWithHistory.length === 0) {
    return (
        <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
                No payment history yet.
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <Tabs defaultValue={debtsWithHistory[0].id} className="w-full">
          <TabsList className="h-auto flex-wrap justify-start p-1 mb-2">
            {debtsWithHistory.map((debt) => (
              <TabsTrigger key={debt.id} value={debt.id}>
                {debt.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {debtsWithHistory.map((debt) => {
            const debtHistory = (historyByDebtId[debt.id] || [])
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            return (
              <TabsContent key={debt.id} value={debt.id} className="m-0">
                <ScrollArea className="h-64 border rounded-md">
                   <div className="p-1 space-y-1">
                    {debtHistory.length > 0 ? (
                      debtHistory.map((entry, index) => (
                        <div key={entry.id}>
                            <div className="flex justify-between items-center p-3">
                                <div>
                                    <p className="font-semibold text-sm">
                                        {entry.type === 'creation' ? `Debt Added` : `Payment`}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {format(new Date(entry.date), "PPP")}
                                    </p>
                                </div>
                                <p className={cn(
                                "font-mono font-semibold text-sm",
                                entry.type === 'creation' ? "text-destructive" : "text-green-500"
                                )}>
                                {entry.type === 'creation' ? `-${formatCurrency(entry.amount)}` : `+${formatCurrency(entry.amount)}`}
                                </p>
                            </div>
                            {index < debtHistory.length - 1 && <Separator />}
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground p-10">
                        No history for this debt.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
