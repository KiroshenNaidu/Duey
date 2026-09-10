'use client';

import { cn } from '@/lib/utils';

/**
 * The app's water-filled day disc — the transport calendar's cell, lifted out so every
 * calendar can mark a day the same way.
 *
 * Two pieces that always travel together:
 *   • `TODAY_DISC` — the class recipe that makes a cell read as TODAY: its `color` flows
 *     through the accent family (arc-animated-accent), a halo pulses behind it (bar-glow),
 *     and a ring painted in that same flowing colour rides along. Always the accent family,
 *     never the primary's, so today is recognisable whatever a theme does to the rest.
 *   • `LiquidFill` — the water itself, at a level that says what the day holds.
 *
 * The host must be `relative overflow-hidden rounded-full` so the water clips to the
 * circle, and any content above it needs `relative z-10`.
 *
 * See globals.css (.liquid-fill / .arc-animated-accent .lf-wave) for the geometry and the
 * reduced-motion and offscreen-freeze rules.
 */

export const TODAY_DISC =
  'arc-animated-accent bar-glow text-[hsl(var(--accent))] bg-accent/15 opacity-100 ring-1 ring-current ring-offset-1 ring-offset-background';

/** How full the disc reads. `half` is the only level that sloshes — a full one is solid
 *  and still, an empty one has nothing to move. */
export type FillLevel = 'empty' | 'half' | 'full';

export function LiquidFill({ level }: { level: FillLevel }) {
  return (
    <span
      aria-hidden
      className={cn('liquid-fill', level === 'full' && 'lf-full', level === 'half' && 'lf-animate')}
      // Full overshoots and empty undershoots so a crest or dip never peeks past the rim.
      style={{ '--fill': level === 'full' ? 1.08 : level === 'half' ? 0.5 : -0.08 } as React.CSSProperties}
    >
      {/* Back wave first, so the front surface paints over it. */}
      <span className="lf-wave lf-wave2" />
      <span className="lf-wave" />
    </span>
  );
}
