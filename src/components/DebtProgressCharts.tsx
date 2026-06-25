'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { Skeleton } from '@/components/ui/skeleton';
import { getProgress } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';

export function DebtProgressCharts() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Bars paint at width 0 then animate to their real progress — replays every time
  // the Stats page becomes active (swipe or tab), not just on first mount. Gated on
  // isClient because the bars only render after hydration (skeleton shows before).
  const barsReady = useReplayOnActive('/stats', isClient);

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
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full bar-animated', barsReady && 'transition-[width] duration-700')}
              style={{
                width: `${barsReady ? debt.progress : 0}%`,
                background: 'repeating-linear-gradient(to right, hsl(var(--primary-a)) 0%, hsl(var(--primary)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary)) 75%, hsl(var(--primary-a)) 100%)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
