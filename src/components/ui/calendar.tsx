'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addMonths, addYears, format, getDay, getDaysInMonth, isSameDay, startOfDay, startOfMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiquidFill, TODAY_DISC } from '@/components/ui/liquid-fill';

/**
 * The app's calendar: one month at a time, tapped through rather than typed or scrolled.
 *
 * Three views behind one grid — tapping the title walks days → months → years and back, so
 * a date years away is three taps rather than a 70-item dropdown. The header's double
 * chevrons step a whole year at once; the row above the grid moves the SELECTION (the
 * header only moves the view), which is what "the same day, a year back" wants to be.
 *
 * Cells are the round mark every other calendar in the app uses (transport, payment
 * history) at a 36px touch target, and the selection takes the accent — the colour those
 * calendars already mark a chosen day with.
 */

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_PAGE = 12;

type View = 'days' | 'months' | 'years';

export function Calendar({ value, onSelect, min, max, quickJumps = true, className }: {
  /** The chosen day, or null for "nothing picked yet". */
  value: Date | null;
  /** `via` says how the day was chosen: a deliberate tap on the grid, or a nudge from the
   *  quick-jump row. A range picker advances to its next field on a tap but must not on a
   *  nudge — the nudge is still aimed at the field you are on. */
  onSelect: (d: Date, via: 'day' | 'jump') => void;
  /** Inclusive bounds. Days outside them stay visible but dead, so the shape of the month
   *  never changes under your finger. */
  min?: Date;
  max?: Date;
  /** The -1 year / -1 month / today / +1 month / +1 year row above the grid. */
  quickJumps?: boolean;
  className?: string;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const selected = value ? startOfDay(value) : null;
  const selectedTime = selected?.getTime() ?? null;

  const [view, setView] = useState<View>('days');
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(selected ?? today));

  // Follow the value when it is set from outside — a preset chip, a re-seed on open — so
  // the grid always shows the month holding the day it says is selected.
  useEffect(() => {
    if (selectedTime != null) setCursor(startOfMonth(new Date(selectedTime)));
  }, [selectedTime]);

  const loBound = min ? startOfDay(min) : null;
  const hiBound = max ? startOfDay(max) : null;
  const outOfRange = (d: Date) =>
    (loBound != null && d.getTime() < loBound.getTime()) ||
    (hiBound != null && d.getTime() > hiBound.getTime());

  /** Where a quick jump would land: the selection moved, then clamped into range. */
  const jumpTarget = (months: number) => {
    const base = selected ?? today;
    // date-fns clamps a month step off the 31st into the shorter month for us.
    const moved = startOfDay(months % 12 === 0 ? addYears(base, months / 12) : addMonths(base, months));
    if (loBound != null && moved < loBound) return loBound;
    if (hiBound != null && moved > hiBound) return hiBound;
    return moved;
  };

  // Only dead once the jump cannot move at all — i.e. you are already sitting on the bound
  // it clamps to.
  const canJump = (months: number) => {
    const base = startOfDay(selected ?? today);
    return jumpTarget(months).getTime() !== base.getTime();
  };

  // The header's step depends on what is on screen: a month in the day grid, a year in the
  // month grid, a page of years in the year grid.
  const stepView = (dir: -1 | 1) => setCursor(c =>
    view === 'days' ? addMonths(c, dir) : view === 'months' ? addYears(c, dir) : addYears(c, dir * YEAR_PAGE));

  const yearPageStart = Math.floor(cursor.getFullYear() / YEAR_PAGE) * YEAR_PAGE;

  const title = view === 'days'
    ? format(cursor, 'MMMM yyyy')
    : view === 'months'
      ? format(cursor, 'yyyy')
      : `${yearPageStart} – ${yearPageStart + YEAR_PAGE - 1}`;

  const monthStart = startOfMonth(cursor);
  const days = Array.from({ length: getDaysInMonth(cursor) }, (_, i) => i + 1);

  const jumps = [
    { label: '-1y', months: -12 },
    { label: '-1m', months: -1 },
  ];
  const forwardJumps = [
    { label: '+1m', months: 1 },
    { label: '+1y', months: 12 },
  ];

  return (
    <div className={cn('select-none', className)}>
      {/* ── Quick jumps: the selection, a month or a year at a time ───────────── */}
      {quickJumps && (
        <div className="flex gap-1 mb-2">
          {jumps.map(j => (
            <JumpChip key={j.label} label={j.label} disabled={!canJump(j.months)} onClick={() => onSelect(jumpTarget(j.months), 'jump')} />
          ))}
          <JumpChip
            label="Today"
            disabled={outOfRange(today)}
            active={selected != null && isSameDay(selected, today)}
            onClick={() => onSelect(today, 'jump')}
          />
          {forwardJumps.map(j => (
            <JumpChip key={j.label} label={j.label} disabled={!canJump(j.months)} onClick={() => onSelect(jumpTarget(j.months), 'jump')} />
          ))}
        </div>
      )}

      {/* ── Where you are, and how to move it ─────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <NavButton
          label="Back a year"
          onClick={() => setCursor(c => addYears(c, -1))}
          className={cn(view !== 'days' && 'invisible')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </NavButton>
        <NavButton label="Back" onClick={() => stepView(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </NavButton>
        {/* Days → months → years → days. The title IS the control: there is no other way
            to reach a distant year, so it has to be the obvious thing to tap. */}
        <button
          type="button"
          onClick={() => setView(v => (v === 'days' ? 'months' : v === 'months' ? 'years' : 'days'))}
          className="flex-1 h-8 rounded-lg text-xs font-semibold text-foreground transition-colors hover:bg-muted/40 active:bg-muted/60"
        >
          {title}
        </button>
        <NavButton label="Forward" onClick={() => stepView(1)}>
          <ChevronRight className="h-4 w-4" />
        </NavButton>
        <NavButton
          label="Forward a year"
          onClick={() => setCursor(c => addYears(c, 1))}
          className={cn(view !== 'days' && 'invisible')}
        >
          <ChevronsRight className="h-4 w-4" />
        </NavButton>
      </div>

      {view === 'days' && (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground mt-2">
            {WEEK_DAYS.map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-1 justify-items-center">
            {Array.from({ length: getDay(monthStart) }).map((_, i) => <div key={`pad-${i}`} />)}
            {days.map(d => {
              const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
              const dead = outOfRange(date);
              const isSelected = selected != null && isSameDay(date, selected);
              const isToday = isSameDay(date, today);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={dead}
                  onClick={() => onSelect(date, 'day')}
                  className={cn(
                    'relative overflow-hidden h-9 w-full max-w-[2.25rem] rounded-full flex items-center justify-center text-xs transition-colors',
                    // Today wears the transport calendar's disc — the flowing accent ring
                    // and halo — and its water level says whether it is also the pick: full
                    // when chosen, empty when it is merely today, exactly as a travelled and
                    // an untravelled day read over there.
                    isToday && TODAY_DISC,
                    !isToday && isSelected && 'bg-accent text-btn-on-accent font-bold',
                    !isToday && !isSelected && 'text-foreground hover:bg-muted/50 active:bg-muted/70',
                    dead && 'text-muted-foreground/30 pointer-events-none',
                  )}
                >
                  {isToday && <LiquidFill level={isSelected ? 'full' : 'empty'} />}
                  {/* Above the water, and coloured for what it sits on: the accent's auto
                      contrast when the water is up, plain foreground when it is not. */}
                  <span className={cn(
                    'relative z-10 leading-none',
                    isToday && (isSelected ? 'text-[hsl(var(--btn-on-accent))] font-bold' : 'text-foreground font-bold'),
                  )}>
                    {d}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === 'months' && (
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {MONTHS_SHORT.map((m, i) => {
            // A month is reachable if any day in it is.
            const first = new Date(cursor.getFullYear(), i, 1);
            const last = new Date(cursor.getFullYear(), i, getDaysInMonth(first));
            const dead = outOfRange(first) && outOfRange(last);
            const isSelected = selected != null
              && selected.getFullYear() === cursor.getFullYear() && selected.getMonth() === i;
            return (
              <button
                key={m}
                type="button"
                disabled={dead}
                onClick={() => { setCursor(first); setView('days'); }}
                className={cn(
                  'h-10 rounded-xl text-xs font-medium transition-colors',
                  isSelected ? 'bg-accent text-btn-on-accent font-bold' : 'text-foreground hover:bg-muted/50 active:bg-muted/70',
                  dead && 'text-muted-foreground/30 pointer-events-none',
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}

      {view === 'years' && (
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {Array.from({ length: YEAR_PAGE }, (_, i) => yearPageStart + i).map(y => {
            const dead = outOfRange(new Date(y, 0, 1)) && outOfRange(new Date(y, 11, 31));
            const isSelected = selected?.getFullYear() === y;
            return (
              <button
                key={y}
                type="button"
                disabled={dead}
                onClick={() => { setCursor(new Date(y, cursor.getMonth(), 1)); setView('months'); }}
                className={cn(
                  'h-10 rounded-xl text-xs font-medium tabular-nums transition-colors',
                  isSelected ? 'bg-accent text-btn-on-accent font-bold' : 'text-foreground hover:bg-muted/50 active:bg-muted/70',
                  dead && 'text-muted-foreground/30 pointer-events-none',
                )}
              >
                {y}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavButton({ label, onClick, className, children }: {
  label: string; onClick: () => void; className?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground',
        'transition-colors hover:bg-muted/40 hover:text-foreground active:bg-muted/60',
        className,
      )}
    >
      {children}
    </button>
  );
}

function JumpChip({ label, onClick, disabled, active }: {
  label: string; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex-1 h-7 rounded-lg text-[10px] font-semibold tabular-nums transition-colors',
        active ? 'bg-accent text-btn-on-accent' : 'bg-muted/40 text-muted-foreground active:bg-muted/70',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {label}
    </button>
  );
}
