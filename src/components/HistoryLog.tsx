'use client';

import { useContext } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from './ui/separator';

export function HistoryLog() {
  const { history } = useContext(AppDataContext);
  
  const sortedHistory = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (history.length === 0) {
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
      <CardContent className="p-0">
        <ScrollArea className="h-72">
          <div className="space-y-2">
            {sortedHistory.map((entry, index) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold text-sm leading-tight">
                      {entry.type === 'creation' ? `Debt Added` : `Payment`}
                    </p>
                    <p className="text-sm text-muted-foreground leading-tight">
                      {entry.debtTitle}
                    </p>
                  </div>
                  <div className="text-right shrink-0 pl-4">
                    <p className={cn(
                      "font-mono text-base font-semibold",
                      entry.type === 'creation' ? "text-destructive" : "text-green-500"
                    )}>
                      {entry.type === 'creation' ? `-${formatCurrency(entry.amount)}` : `+${formatCurrency(entry.amount)}`}
                    </p>
                     <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.date), "PPP")}
                    </p>
                  </div>
                </div>
                {index < sortedHistory.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
