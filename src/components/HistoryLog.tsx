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
            <CardContent className="pt-6 text-center text-muted-foreground">
                No payment history yet.
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="h-72">
          <div className="p-4 space-y-4">
            {history.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{entry.debtTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(entry.date), "PPP p")}
                  </p>
                </div>
                <p className="font-mono text-lg text-green-400">
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
