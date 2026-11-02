'use client';

import { MoneyOverview } from '@/components/MoneyOverview';

/**
 * Overview — where your money stands right now: the cycle's balance (what's left, what came
 * in, what went out, and the button that closes the cycle), then savings. Statistics over
 * time live on Money → Stats; this page is the present tense.
 *
 * Savings sits last: a pot recorded by hand. What you put away shows up above as a
 * deduction of the cycle; the remainder never flows into it on its own.
 */
export function OverviewPage() {
  return (
    <div className="container mx-auto max-w-md pt-11 pb-4">
      <div className="text-center mb-3">
        <h1 className="text-lg font-bold text-foreground">Overview</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Your balance and savings</p>
      </div>
      {/* MoneyOverview ends with the Savings card: both follow the same cycle stepper. */}
      <MoneyOverview />
    </div>
  );
}
