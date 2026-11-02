'use client';

import { useId, useMemo, useState, useEffect } from 'react';
import type { BudgetItem } from '@/lib/types';
import { displayProgressPct } from '@/lib/calculations';
import { cn } from '@/lib/utils';

// Geometry for the concentric multi-ring gauge (mirrors the Highcharts solidgauge look)
const SIZE = 200;
const CENTER = SIZE / 2;
const PAD = 2;          // outer padding from the viewBox edge
const CENTER_HOLE = 26; // radius reserved in the middle for the % readout
const MAX_WIDTH = 18;   // "normal" ring thickness used when there are only a few items
const MIN_WIDTH = 6;    // floor so rings stay visible when there are many items
const GAP_RATIO = 0.28; // gap between rings as a fraction of ring width
const SEGMENT_GAP = 3;  // along-the-ring breathing room between one item's tip and the next's
const CORNER_RATIO = 0.3; // segment corner radius as a fraction of ring width (0.5 would be fully round)
const MASK_BLEED = 12;    // how far the reveal mask reaches past a segment, so its glow isn't clipped

/**
 * Path for one ring segment: an annular sector from angle 0 to `sweep` (radians, clockwise
 * in SVG's y-down space) centred on the gauge, with its four corners rounded by `corner`.
 * Each rounded corner is a small circle tangent to both the radial edge and the ring's
 * outer/inner arc; its centre sits `corner` in from that arc, so it touches the arc
 * `asin(corner / centreDistance)` radians along from the edge.
 */
function segmentPath(r: number, width: number, sweep: number, cornerMax: number) {
  const ro = r + width / 2;
  const ri = r - width / 2;
  // A short segment can't fit full corners: shrink them so the two inner corners never cross.
  const corner = Math.max(0, Math.min(cornerMax, (ri * sweep) / 2 * 0.9));
  const dOut = Math.asin(corner / (ro - corner));
  const dIn = Math.asin(corner / (ri + corner));
  const edgeOut = Math.sqrt((ro - corner) ** 2 - corner ** 2); // where each corner meets the radial edge
  const edgeIn = Math.sqrt((ri + corner) ** 2 - corner ** 2);
  const pt = (rad: number, a: number) =>
    `${(CENTER + rad * Math.cos(a)).toFixed(3)} ${(CENTER + rad * Math.sin(a)).toFixed(3)}`;
  const largeOut = sweep - 2 * dOut > Math.PI ? 1 : 0;
  const largeIn = sweep - 2 * dIn > Math.PI ? 1 : 0;
  return [
    `M ${pt(edgeOut, 0)}`,
    `A ${corner} ${corner} 0 0 1 ${pt(ro, dOut)}`,
    `A ${ro} ${ro} 0 ${largeOut} 1 ${pt(ro, sweep - dOut)}`,
    `A ${corner} ${corner} 0 0 1 ${pt(edgeOut, sweep)}`,
    `L ${pt(edgeIn, sweep)}`,
    `A ${corner} ${corner} 0 0 1 ${pt(ri, sweep - dIn)}`,
    `A ${ri} ${ri} 0 ${largeIn} 0 ${pt(ri, dIn)}`,
    `A ${corner} ${corner} 0 0 1 ${pt(edgeIn, 0)}`,
    'Z',
  ].join(' ');
}

interface Ring {
  share: number; // 0..1 of total budget
  start: number; // 0..1 around the circle where this ring's arc begins
  color: string;
}

/**
 * Each concentric ring represents one budget item, filled to its share of the
 * total budget — one ring per item, no cap. Each arc starts where the previous
 * ring's arc ended, so read outer → inner the rings stack around the circle like
 * one split bar. Ring thickness scales with the number of items: a few items
 * render at full width; many items render thinner so every ring still fits
 * inside the gauge. Items are expected pre-sorted (largest first); colors are
 * matched by index so rings line up with the legend.
 */
export function BudgetGauge({ items, budget, colors }: {
  items: BudgetItem[];
  budget: number;
  colors: string[];
}) {
  const rings = useMemo<Ring[]>(() => {
    let cumulative = 0;
    return items.map((it, i) => {
      const share = budget > 0 ? Math.min(1, it.price / budget) : 0;
      // Over budget the running total passes a full turn; wrap so later rings keep
      // stacking around the circle instead of all piling up at the top.
      const ring = { share, start: cumulative % 1, color: colors[i % colors.length] ?? 'hsl(var(--primary))' };
      cumulative += share;
      return ring;
    });
  }, [items, budget, colors]);

  // Per-gauge prefix for the reveal-mask ids — several plans can be on screen at once.
  // useId output carries characters that aren't safe inside url(#…), so keep word chars.
  const uid = 'bg' + useId().replace(/\W/g, '');

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
  const over = spent > budget;
  // Never round INTO 0%/100%: a plan with a few cents on it must not read "0% used", and
  // one a rand short of its ceiling must not read "100%". Overspending is the one case
  // that genuinely exceeds the ceiling, so it shows the true (>100) figure.
  const rawPct = budget > 0 ? (spent / budget) * 100 : 0;
  const usedPct = over ? Math.round(rawPct) : displayProgressPct(rawPct);

  return (
    <div className="relative mx-auto" style={{ width: SIZE, maxWidth: '100%', aspectRatio: '1 / 1', padding: 4 }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full" style={{ overflow: 'visible' }}>
        {rings.map((ring, i) => {
          const r = outerR - i * step;
          if (r <= ringWidth / 2) return null;
          const circumference = 2 * Math.PI * r;
          // The segment is a filled shape that stays inside its own slot (no caps
          // overshooting), trimmed by half a SEGMENT_GAP at each end and centred in the
          // slot so neighbouring items never touch. A slot shorter than the gap still
          // gets a sliver so the item is visible.
          const slot = ring.share * circumference;
          const len = ring.share > 0 ? Math.max(1.5, slot - SEGMENT_GAP) : 0;
          const startAngle = (ring.start + (slot - len) / 2 / circumference) * 360;
          // Reveal mask: a wide stroke that sweeps open over the segment (plus a bleed
          // either side for the glow) — the old dash fill-in animation, now uncovering
          // the shape instead of drawing it.
          const bleedDeg = (MASK_BLEED / circumference) * 360;
          const reveal = len + MASK_BLEED * 2;
          const maskId = `${uid}-m${i}`;
          return (
            <g key={i} transform={`rotate(${-90 + startAngle} ${CENTER} ${CENTER})`}>
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
              {/* Value — starts hidden, sweeps open to its share when `ready` fires.
                  Each ring is delayed by 70ms × its index so they cascade
                  from the outermost ring inward. */}
              {len > 0 && (
                <>
                  <mask id={maskId} maskUnits="userSpaceOnUse" x={-SIZE} y={-SIZE} width={SIZE * 3} height={SIZE * 3}>
                    <circle
                      cx={CENTER}
                      cy={CENTER}
                      r={r}
                      fill="none"
                      stroke="white"
                      strokeWidth={ringWidth + MASK_BLEED * 2}
                      strokeDasharray={circumference}
                      strokeDashoffset={ready ? circumference - reveal : circumference}
                      transform={`rotate(${-bleedDeg} ${CENTER} ${CENTER})`}
                      style={{
                        transition: 'stroke-dashoffset 0.85s cubic-bezier(0.22, 1, 0.36, 1)',
                        transitionDelay: ready ? `${i * 70}ms` : '0ms',
                      }}
                    />
                  </mask>
                  <g mask={`url(#${maskId})`}>
                    <path
                      d={segmentPath(r, ringWidth, len / r, ringWidth * CORNER_RATIO)}
                      fill={ring.color}
                      className="ring-pulse"
                      style={{
                        animationDelay: `${i * 0.25}s`,
                        ['--ring-color' as string]: ring.color,
                      } as React.CSSProperties}
                    />
                  </g>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className={cn('text-[1rem] leading-none font-bold tabular-nums', over ? 'text-destructive' : 'text-foreground')}>
          {usedPct}%
        </span>
        <span className="text-[10px] text-muted-foreground"></span>
      </div>
    </div>
  );
}
