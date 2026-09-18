'use client';

import { useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarClock, Info } from 'lucide-react';
import { getPayCycle } from '@/lib/calculations';
import { cn } from '@/lib/utils';

/**
 * Settings → Pay Date. One number, but it moves the whole app's month: every screen that
 * says "this cycle" measures from this day, and it is the day the balance starts over.
 *
 * Same shape as the Notifications menu (draft + dirty ring + Save/Cancel), because it is
 * the same kind of thing: a setting with real consequences that you commit deliberately
 * rather than one that applies as you type.
 *
 * The value itself is userProfile.paydayDay — the payday the profile has always carried,
 * now actually load-bearing. There is deliberately no second "cycle day" setting: two days
 * that both claim to be your payday can only ever disagree.
 */

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

interface PayDateMenuProps {
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (msg: string) => void;
  onCancel?: () => void;
}

export function PayDateMenu({ onDirtyChange, onSaved, onCancel }: PayDateMenuProps) {
  const { userProfile, setUserProfile } = useContext(AppDataContext);

  const [dayStr, setDayStr] = useState(String(userProfile.paydayDay));
  const [infoOpen, setInfoOpen] = useState(false);
  const parsed = parseInt(dayStr, 10);
  const valid = !isNaN(parsed) && parsed >= 1 && parsed <= 31;
  const isDirty = valid && parsed !== userProfile.paydayDay;

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Preview runs off the DRAFT, so the window and the countdown move as you try days out —
  // the fastest way to see that "the 26th" means "26 Aug – 25 Sep", not "August".
  const preview = getPayCycle(valid ? parsed : userProfile.paydayDay);

  const handleSave = () => {
    if (!valid) return;
    setUserProfile({ ...userProfile, paydayDay: parsed });
    onDirtyChange?.(false);
    onSaved?.('Pay date saved');
  };

  const handleCancel = () => {
    setDayStr(String(userProfile.paydayDay));
    onDirtyChange?.(false);
    onCancel?.();
  };

  return (
    <div className="space-y-3">
      {/* Save / Cancel */}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={handleCancel}>Cancel</Button>
        <Button
          className={cn('flex-1', isDirty && 'ring-2 ring-accent/50 ring-offset-1 ring-offset-background')}
          onClick={handleSave}
          disabled={!valid}
        >
          Save
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-accent shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pay Date</p>
            {/* The consequences of this setting are worth reading ONCE and then never
                again, so they sit behind an "i" rather than taking up a permanent card
                below the editor. */}
            <button
              type="button"
              onClick={() => setInfoOpen(v => !v)}
              aria-expanded={infoOpen}
              aria-controls="paydate-info"
              aria-label={infoOpen ? 'Hide what resets on this day' : 'What resets on this day'}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                infoOpen
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
              )}
            >
              <Info className="h-3 w-3" />
            </button>
          </div>

          {/* Slides down from under the heading, pushing the editor with it — the same
              height reveal + easing the Day/Night card uses for its drop-down, so every
              expanding panel in Settings moves the same way. */}
          <AnimatePresence initial={false}>
            {infoOpen && (
              <motion.div
                key="paydate-info"
                id="paydate-info"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl bg-muted/30 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">What resets on this day</p>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                    <li><span className="text-foreground font-medium">Balance</span> - income, deductions and what&apos;s left are counted from this day.</li>
                    <li><span className="text-foreground font-medium">Stats</span> - the cycle snapshot covers the same window.</li>
                    <li><span className="text-foreground font-medium">One-time expenses and extra income</span> - cleared on this day instead of the 1st. Recurring ones stay.</li>
                    <li><span className="text-foreground font-medium">History</span> - the finished cycle is sealed into a permanent summary.</li>
                  </ul>
                  <p className="text-[10px] text-muted-foreground/70 pt-1">
                    Debts, transport days and Uber rides are untouched - they keep their own dates.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5">
            <Label className="text-xs">Day of month you get paid (1–31)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={dayStr}
              onChange={e => setDayStr(e.target.value)}
            />
            {valid ? (
              <p className="text-[10px] text-muted-foreground">
                Paid on the {ordinal(parsed)}
                {parsed > 28 && ' - months without that day use their last day instead'}
              </p>
            ) : (
              <p className="text-[10px] text-destructive">Enter a day between 1 and 31.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live preview of the cycle the chosen day produces. */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {isDirty ? 'Cycle you would get' : 'Current cycle'}
          </p>
          <p className="text-base font-bold text-foreground">{preview.label}</p>
          <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(preview.progress * 100)}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {/* daysLeft counts to the NEXT pay date, so it is never 0: on pay day itself the
                new cycle has already begun and the count is that cycle's full length. */}
            Starts over in {preview.daysLeft} day{preview.daysLeft === 1 ? '' : 's'}, on {format(preview.end, 'd MMMM')}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
