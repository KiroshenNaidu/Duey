'use client';

import { useContext, useMemo } from 'react';
import { AppDataContext } from '@/context/AppDataContext';
import { dayKey } from '@/lib/calculations';
import { buildTimeline, type CycleTimeline } from '@/lib/cycles';

/**
 * The money-cycle timeline for whichever cycle mode the user is in (see lib/cycles.ts).
 * Rebuilt when the mode, the open manual cycle, the pay day or History changes — and when
 * the day turns over, since both the open manual cycle ("through today") and the pay-date
 * countdown are measured to today.
 */
export function useCycles(): CycleTimeline {
  const { cycleMode, manualCycleStart, manualCycleKey, userProfile, history } = useContext(AppDataContext);
  const today = dayKey(new Date());
  return useMemo(
    () => buildTimeline({ mode: cycleMode, payDay: userProfile.paydayDay, manualCycleStart, manualCycleKey, history }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` re-derives on day rollover
    [cycleMode, manualCycleStart, manualCycleKey, userProfile.paydayDay, history, today],
  );
}
