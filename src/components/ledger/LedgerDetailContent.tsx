'use client';

import type { ReactNode } from 'react';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface LedgerDetailContentProps {
  /** Screen-reader dialog title; the visible headline lives inside {hero}. */
  a11yTitle: string;
  /** Full-bleed hero block (gauge + headline + figures). Supplies its own padding. */
  hero: ReactNode;
  /** Portaled child dialogs (debt payment / save-confirm). Rendered, not laid out. */
  nested?: ReactNode;
  /** Scrollable form body. The wrapper supplies px-5, the top border and spacing. */
  children: ReactNode;
  /** Pinned bottom action row contents. The wrapper supplies px-5 and the border. */
  actions: ReactNode;
}

/**
 * Shared detail / edit sheet frame for both money ledgers — "Payable" (DebtCard)
 * and "Receivable" (LoansList). A fixed column: hero, one scroll region, and a
 * pinned action row that never clips on a short (keyboard-open) viewport.
 * Everything inside the slots is caller-supplied.
 */
export function LedgerDetailContent({ a11yTitle, hero, nested, children, actions }: LedgerDetailContentProps) {
  return (
    <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden flex flex-col">
      <DialogHeader className="sr-only">
        <DialogTitle>{a11yTitle}</DialogTitle>
      </DialogHeader>

      {/* Nested dialogs live inside this DialogContent so Radix treats them as
          children — opening one does not dismiss this sheet. */}
      {nested}

      {/* Everything except the action row is one scroll region, so on a short
          viewport the hero scrolls away rather than crushing the form. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {hero}
        <div className="px-5 pb-5 space-y-4 border-t pt-4">
          {children}
        </div>
      </div>

      {/* Pinned action row — outside the scroll area so it is never clipped. */}
      <div className="shrink-0 flex justify-between items-center gap-2 border-t px-5 py-4">
        {actions}
      </div>
    </DialogContent>
  );
}
