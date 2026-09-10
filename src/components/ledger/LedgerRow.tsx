'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useReplayOnActive } from '@/hooks/useReplayOnActive';

const COMPLETE_COLOR: CSSProperties = { color: 'hsl(var(--primary-complete))' };

export interface LedgerRowProps {
  /** Main title line — the caller composes person / reason / date styling. */
  title: ReactNode;
  /** Small muted node shown right of the title (e.g. "3 of 12 (25%)"). */
  meta?: ReactNode;
  /** Optional chip shown just before {meta} (due-day / overdue). */
  badge?: ReactNode;
  /** Trailing control on the header row (edit button). Omit for tap-to-open rows. */
  action?: ReactNode;
  /** Absolutely-positioned node layered behind the fill (debt staged-payment ghost). */
  ghost?: ReactNode;
  /** 0–100. */
  progress: number;
  paidOff?: boolean;
  footerLeft: ReactNode;
  footerRight: ReactNode;
  /** Tighter radius when nested inside a person group. */
  grouped?: boolean;
  /** Selection glow (debt multi-select). */
  selected?: boolean;
  className?: string;
}

/**
 * The shared list card for both money ledgers — "Payable" (DebtCard) and
 * "Receivable" (LoansList). Purely presentational: every figure, label and
 * control is composed by the caller and passed in. The animated payoff bar
 * (flowing gradient, glow when complete, replay on page re-entry) lives here so
 * the two sides stay pixel-identical.
 */
export function LedgerRow({
  title, meta, badge, action, ghost, progress, paidOff = false,
  footerLeft, footerRight, grouped = false, selected = false, className,
}: LedgerRowProps) {
  const barReady = useReplayOnActive('/');

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-300',
        grouped ? 'rounded-[0.7rem]' : 'rounded-[1rem]',
        selected && 'sel-glow',
        className,
      )}
    >
      <CardHeader>
        <div className="flex justify-between items-center gap-2">
          <div className="min-w-0 pr-2">
            <CardTitle
              className="text-base font-bold truncate"
              style={paidOff ? COMPLETE_COLOR : undefined}
            >
              {title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            {meta != null && (
              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">{meta}</span>
            )}
            {action}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Payoff bar — ghost segment (staged payment) sits behind the solid fill;
            solid fill is a flowing gradient that stays in-theme and glows when done. */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          {ghost}
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full bar-animated',
              barReady && 'transition-[width] duration-700',
              paidOff && 'bar-glow',
            )}
            style={{
              width: `${barReady ? progress : 0}%`,
              background: paidOff
                ? 'repeating-linear-gradient(to right, hsl(var(--primary-b)) 0%, hsl(var(--primary-complete)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary-complete)) 75%, hsl(var(--primary-b)) 100%)'
                : 'repeating-linear-gradient(to right, hsl(var(--primary-a)) 0%, hsl(var(--primary)) 25%, hsl(var(--primary-b)) 50%, hsl(var(--primary)) 75%, hsl(var(--primary-a)) 100%)',
            }}
          />
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span
            className="text-xs font-medium text-muted-foreground min-w-0 truncate tabular-nums"
            style={paidOff ? COMPLETE_COLOR : undefined}
          >
            {footerLeft}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums shrink-0">
            {footerRight}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
