'use client';

import { useMemo, useState, useEffect } from 'react';
import type { BudgetItem } from '@/lib/types';
import { cn } from '@/lib/utils';

// Geometry for the concentric multi-ring gauge (mirrors the Highcharts solidgauge look)
const SIZE = 200;
const CENTER = SIZE / 2;
const PAD = 2;          // outer padding from the viewBox edge
const CENTER_HOLE = 26; // radius reserved in the middle for the % readout
const MAX_WIDTH = 18;   // "normal" ring thickness used when there are only a few items
const MIN_WIDTH = 6;    // floor so rings stay visible when there are many items
const GAP_RATIO = 0.28; // gap between rings as a fraction of ring width

interface Ring {
  share: number; // 0..1 of total budget
  color: string;
}

/**
 * Each concentric ring represents one budget item, filled to its share of the
 * total budget — one ring per item, no cap. Ring thickness scales with the
 * number of items: a few items render at full width; many items render thinner
 * so every ring still fits inside the gauge. Items are expected pre-sorted
 * (largest first); colors are matched by index so rings line up with the legend.
 */
export function BudgetGauge({ items, budget, colors }: {
  items: BudgetItem[];
  budget: number;
  colors: string[];
}) {
  const rings = useMemo<Ring[]>(
    () =>
      items.map((it, i) => ({
        share: budget > 0 ? Math.min(1, it.price / budget) : 0,
        color: colors[i % colors.length] ?? 'hsl(var(--primary))',
      })),
    [items, budget, colors]
  );

  const n = rings.length;

  // Solve for the ring width that lets all n rings (plus inter-ring gaps) fit
  // between the outer edge and the center hole, then clamp to a sane range.
  // total radial space = n*width + (n-1)*gap, gap = GAP_RATIO*width
  const available = CENTER - PAD - CENTER_HOLE;
  const denom = n + Math.max(0, n - 1) * GAP_RATIO;
  const ringWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, denom > 0 ? available / denom : MAX_WIDTH));
  const gap = ringWidth * GAP_RATIO;
  const step = ringWidth + gap;
  const outerR = CENTER - PAD - ringWidth / 2;

  // `ready` flips true one frame after mount, triggering the fill-in animation.
  // Without this, the rings are already at their final value on first paint
  // so the CSS transition has nothing to animate.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Double-RAF ensures the browser has painted the empty rings first
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const spent = items.reduce((s, i) => s + i.price, 0);
  const usedPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const over = spent > budget;

  return (
    <div className="relative mx-auto" style={{ width: SIZE, maxWidth: '100%', aspectRatio: '1 / 1', padding: 4 }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full" style={{ overflow: 'visible' }}>
        {rings.map((ring, i) => {
          const r = outerR - i * step;
          if (r <= ringWidth / 2) return null;
          const circumference = 2 * Math.PI * r;
          return (
            <g key={i} transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {/* Track */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeOpacity={0.18}
                strokeWidth={ringWidth}
              />
              {/* Value — starts empty, fills to its share when `ready` fires.
                  Each ring is delayed by 70ms × its index so they cascade
                  from the outermost ring inward. */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={ringWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={ready ? circumference * (1 - ring.share) : circumference}
                className="ring-pulse"
                style={{
                  transition: 'stroke-dashoffset 0.85s cubic-bezier(0.22, 1, 0.36, 1)',
                  transitionDelay: ready ? `${i * 70}ms` : '0ms',
                  animationDelay: `${i * 0.25}s`,
                  ['--ring-color' as string]: ring.color,
                } as React.CSSProperties}
              />
            </g>
          );
        })}
      </svg>
      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className={cn('text-[1.2rem] leading-none font-bold tabular-nums', over ? 'text-destructive' : 'text-foreground')}>
          {usedPct}%
        </span>
        <span className="text-[10px] text-muted-foreground">used</span>
      </div>
    </div>
  );
}
