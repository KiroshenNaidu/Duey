'use client';

import { useContext, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AppDataContext } from '@/context/AppDataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';
import { getPayCycle, normalizePayDay } from '@/lib/calculations';
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

// The days people actually get paid on, one tap each. 31 is offered as "Last day" because
// that is what it means: a 31st pay day clamps to the 30th/28th in shorter months.
const QUICK_DAYS: { day: number; label: string }[] = [
  { day: 1, label: '1st' },
  { day: 15, label: '15th' },
  { day: 25, label: '25th' },
  { day: 26, label: '26th' },
  { day: 31, label: 'Last day' },
];

interface PayDateMenuProps {
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (msg: string) => void;
  onCancel?: () => void;
}

export function PayDateMenu({ onDirtyChange, onSaved, onCancel }: PayDateMenuProps) {
  const { userProfile, setUserProfile, notificationSettings } = useContext(AppDataContext);

  const [dayStr, setDayStr] = useState(String(userProfile.paydayDay));
  const parsed = parseInt(dayStr, 10);
  const valid = !isNaN(parsed) && parsed >= 1 && parsed <= 31;
  const isDirty = valid && parsed !== userProfile.paydayDay;

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Preview runs off the DRAFT, so the window and the countdown move as you try days out —
  // the fastest way to see that "the 26th" means "26 Aug – 25 Sep", not "August".
  const preview = getPayCycle(valid ? parsed : userProfile.paydayDay);
  const previewDay = normalizePayDay(valid ? parsed : userProfile.paydayDay);

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
          </div>

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
                {parsed > 28 && ' — months without that day use their last day instead'}
              </p>
            ) : (
              <p className="text-[10px] text-destructive">Enter a day between 1 and 31.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_DAYS.map(({ day, label }) => (
              <button
                key={day}
                onClick={() => setDayStr(String(day))}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
                  previewDay === day && valid
                    ? 'border-accent bg-accent/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}
              >
                {label}
              </button>
            ))}
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
            {preview.daysLeft === 0
              ? 'Today is pay day — the cycle starts over.'
              : `Starts over in ${preview.daysLeft} day${preview.daysLeft === 1 ? '' : 's'}, on ${format(preview.end, 'd MMMM')}.`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">What resets on this day</p>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li><span className="text-foreground font-medium">Balance</span> — income, deductions and what&apos;s left are counted from this day.</li>
            <li><span className="text-foreground font-medium">Stats</span> — the cycle snapshot covers the same window.</li>
            <li><span className="text-foreground font-medium">One-time expenses and extra income</span> — cleared on this day instead of the 1st. Recurring ones stay.</li>
            <li><span className="text-foreground font-medium">History</span> — the finished cycle is sealed into a permanent summary.</li>
          </ul>
          <p className="text-[10px] text-muted-foreground/70 pt-1">
            Debts, transport days and Uber rides are untouched — they keep their own dates.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">
            Your payment reminder is set separately, on the {ordinal(notificationSettings.paydayDay || userProfile.paydayDay)} —
            change it under Notifications.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
