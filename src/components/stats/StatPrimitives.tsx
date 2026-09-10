'use client';

import { cn } from '@/lib/utils';

/**
 * The small pieces the Stats screens share, in one place so a pill on the Overview tab and
 * a pill on the Savings tab cannot drift apart — they had drifted, which is what this file
 * is for. Card shells and headings live with the Card component itself (`CardHeading`);
 * only the stat-specific bits are here.
 */

/** One figure in a grid of pills: category icon, the number, what it counts. */
export function StatPill({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  /** Optional second line — which cycle it was, what it is made of. */
  sub?: string;
  /** Category colour, applied to the icon and the figure together. Defaults to an accent
   *  icon over a plain figure, which is what an uncategorised stat wants. */
  color?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-3 flex flex-col gap-1.5">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', color ?? 'text-accent')} />
      <p className={cn('text-sm font-bold leading-tight truncate tabular-nums', color ?? 'text-foreground')}>{value}</p>
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60 truncate -mt-1">{sub}</p>}
    </div>
  );
}

/** A chart legend entry: the series' swatch, its name, and optionally its total. The colour
 *  is a CSS colour rather than a class because the marks it labels are inline-styled SVG
 *  and div fills — the swatch has to be able to match them exactly. */
export function LegendDot({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px] text-muted-foreground truncate">{label}</span>
      {value && <span className="text-[10px] font-semibold tabular-nums text-foreground shrink-0">{value}</span>}
    </span>
  );
}
