'use client';

import { useContext } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

export function HistoryLog() {
  const { history } = useContext(AppDataContext);

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
          <div className="divide-y divide-border">
            {history.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center p-4">
                <div>
                  <p className="font-semibold text-sm">{entry.debtTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.date), "PPp")}
                  </p>
                </div>
                <p className="font-mono text-base font-semibold text-green-400 shrink-0 pl-4">
                  {formatCurrency(entry.amount)}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
