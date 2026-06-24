'use client';

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

export function DebtSemiGauge({ progress, paidOff, className }: {
  progress: number;
  paidOff?: boolean;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, progress));

  return (
    <div
      className={cn('relative shrink-0', paidOff ? 'text-positive' : 'text-primary', className)}
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
        {/* Value */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${p} 100`}
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
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
