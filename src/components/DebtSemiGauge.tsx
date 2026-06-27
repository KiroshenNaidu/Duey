'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// A sideways semicircular gauge (a "C" opening to the right). The arc traces the
// left half of a circle from top → left → bottom and fills with progress. It is
// drawn in `currentColor`, so it inherits whatever themed text colour the parent
// sets — keeping it in sync with the theme like the rest of the text.
const W = 92;
const H = 132;
const CX = 58;          // arc centre sits right-of-middle so the "C" opens toward the value
const CY = H / 2;
const R = 52;
const STROKE = 9;       // intentionally thinner than the reference illustration

// Left semicircle: top (CX, CY-R) → left → bottom (CX, CY+R). sweep-flag 0 bulges left.
const ARC_PATH = `M ${CX} ${CY - R} A ${R} ${R} 0 0 0 ${CX} ${CY + R}`;

export function DebtSemiGauge({ progress, pendingProgress = 0, paidOff, className }: {
  progress: number;
  /** Extra progress percentage to show as a ghost preview (staged payment) */
  pendingProgress?: number;
  paidOff?: boolean;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, progress));
  const ghost = Math.max(0, Math.min(100 - p, pendingProgress));

  // Fill-in on mount — same double-RAF trick as BudgetGauge so the browser
  // paints the empty arc first, then animates to the real value.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={cn(
        'relative shrink-0',
        paidOff ? 'arc-animated-complete' : 'arc-animated',
        className
      )}
      style={{ width: W, height: H }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
        {/* Track */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {/* Ghost arc: shows where the staged payment will reach.
            Drawn from 0→(p+ghost) behind the solid arc, so only the
            portion beyond p is visually new (lighter preview). */}
        {ghost > 0 && (
          <path
            d={ARC_PATH}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.38}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${p + ghost} 100`}
            style={{ transition: 'stroke-dasharray 0.35s ease-out' }}
          />
        )}
        {/* Solid value: starts empty, draws itself in when ready (fill-in on mount).
            A round linecap on a zero-length dash renders as a stray dot, so at 0%
            we drop to a butt cap — that draws nothing and keeps the gauge clean. */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap={p > 0 ? 'round' : 'butt'}
          pathLength={100}
          strokeDasharray={ready ? `${p} 100` : '0 100'}
          style={{ transition: 'stroke-dasharray 0.85s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      {/* Value readout, seated in the mouth of the "C" */}
      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
        style={{ left: '62%' }}
      >
        <span className="text-2xl font-black tabular-nums leading-none">{Math.round(p)}%</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">complete</span>
      </div>
    </div>
  );
}
