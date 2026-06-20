'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Skeleton } from '@/components/ui/skeleton';
import { getProgress } from '@/lib/calculations';
import { Progress } from '@/components/ui/progress';

export function DebtProgressCharts() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const debtProgressData = useMemo(() => {
    return debts.map((debt) => ({
      id: debt.id,
      name: debt.title,
      progress: getProgress(debt, history),
    })).sort((a, b) => b.progress - a.progress);
  }, [debts, history]);

  if (!isClient) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4"><Skeleton className="h-4 w-12" /><Skeleton className="h-2 w-full" /></div>
        <div className="flex items-center gap-4"><Skeleton className="h-4 w-12" /><Skeleton className="h-2 w-full" /></div>
        <div className="flex items-center gap-4"><Skeleton className="h-4 w-12" /><Skeleton className="h-2 w-full" /></div>
      </div>
    );
  }

  if (debts.length === 0) {
    return (
        <p className="text-sm text-muted-foreground text-center py-4">No debts with progress to show.</p>
    );
  }

  return (
    <div className="space-y-3">
      {debtProgressData.map((debt) => (
        <div key={debt.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground truncate">{debt.name}</span>
            <span className="text-xs font-mono text-muted-foreground shrink-0">{Math.round(debt.progress)}%</span>
          </div>
          <Progress value={debt.progress} className="h-1.5 bg-muted/40 [&>*]:bg-accent" />
        </div>
      ))}
    </div>
  );
}
