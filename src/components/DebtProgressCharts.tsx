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
        <div key={debt.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
          <span className="text-xs font-medium text-foreground truncate">
            {debt.name.substring(0, 5)}
          </span>
          <Progress value={debt.progress} className="h-2 bg-card [&>*]:bg-accent" />
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {Math.round(debt.progress)}%
          </span>
        </div>
      ))}
    </div>
  );
}
