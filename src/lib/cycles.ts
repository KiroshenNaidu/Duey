import { add, format, startOfDay } from 'date-fns';
import type { CycleMode, HistoryEntry } from '@/lib/types';
import {
  cycleKey, cycleStartFromKey, getPayCycle, listRecentCycles, normalizePayDay, stepCycleKey,
  type MoneyWindow,
} from '@/lib/calculations';

// ─── Money cycles, whichever way they end ──────────────────────────────────────
// The money screens (Overview, the close-cycle flow, History summaries) report on "a cycle", and used to ask the
// pay-date maths in lib/calculations directly — so a cycle could only ever be pay date →
// pay date. Manual mode lets the user end a cycle whenever they choose, so a cycle can now
// start and stop on any day, and the only record of where the old ones began and ended is
// the summary each one left in History.
//
// This file is the one place that knows both kinds. Screens ask a CycleTimeline for the
// current cycle, its neighbours and their windows, and never care which mode produced them.
//
//   • auto   — the pay-date maths, unchanged. Every cycle, past or future, is computable.
//   • manual — the cycles closed so far (read from their History summaries), oldest first,
//              then the open one, which runs from the last close through today. Nothing is
//              known about a cycle that has not been closed yet, so there is no "next".

/** One cycle, however it is bounded. `end` is exclusive. */
export interface Period {
  key: string;
  start: Date;
  /** Exclusive. The open manual cycle runs through TODAY, so its end is tomorrow. */
  end: Date;
  /** The last day the cycle actually covers — what labels read. */
  lastDay: Date;
  /** What the app calls it: the month and year it ends in — "November 2026". The open
   *  manual cycle is the month you are in. Screens say "month", never "cycle". */
  label: string;
  /** The exact days it covers — "26 Oct – 2 Nov 2026"; the open manual cycle reads "Since
   *  26 Oct 2026". For telling apart two cycles that end in the same month, and for History
   *  summary titles, which must stay unique. */
  range: string;
  /** Chart axis label. */
  short: string;
}

export interface CycleTimeline {
  mode: CycleMode;
  payDay: number;
  current: Period;
  /** How long until the cycle turns over on its own — null in manual mode, where it never does. */
  countdown: { daysLeft: number; progress: number; resetsOn: Date } | null;
  /** Whether a cycle that has not started can be looked at. Only pay dates are known ahead. */
  canProject: boolean;
  /** Any cycle by key, including keys a savings entry was filed under long ago. */
  period(key: string): Period;
  /** The neighbouring cycle. Manual mode stops at the oldest and the open one. */
  step(key: string, dir: -1 | 1): string;
  /** The cycle a day falls in. */
  keyOf(date: Date): string;
  /** Every key from one end to the other, inclusive and oldest first. */
  keysBetween(a: string, b: string): string[];
  /** The oldest cycle there is anything recorded in. */
  earliestKey: string;
  /** The current cycle and up to `back` before it, newest first — "which cycle was this for?" */
  recent(back: number): Period[];
}

export interface CycleSource {
  mode: CycleMode;
  payDay: number;
  manualCycleStart: string;
  manualCycleKey: string;
  history: HistoryEntry[];
}

/** Key for a manual cycle that starts at `start`: a sortable local stamp. Sorts after the
 *  'yyyy-MM' keys of the automatic cycles before it, so keys of both kinds still compare
 *  chronologically as strings. */
export const manualKeyFor = (start: Date): string => format(start, "yyyy-MM-dd'T'HH:mm:ss");

const isMonthKey = (key: string) => /^\d{4}-\d{2}$/.test(key);

/** When one-time items (expenses, extra income) are cleared — for the copy that promises it. */
export const clearsWhen = (mode: CycleMode): string =>
  mode === 'manual' ? 'when you close the month' : 'on your next pay date';

/**
 * Travel is counted per DAY, so a cycle closed at 3pm would otherwise bill that day twice —
 * once to the cycle it closed and again to the one it opened. The day you close on belongs
 * to the cycle you closed, so a cycle that starts mid-day starts its travel tomorrow. Cycles
 * starting at midnight (every automatic one, and the one carried over by the switch to
 * manual) start their travel the same day.
 */
export const transportStartOf = (start: Date): Date =>
  start.getTime() === startOfDay(start).getTime() ? start : add(startOfDay(start), { days: 1 });

/** The span a cycle's money is measured over, for calculateLiveMonthly / the seal. */
export const moneyWindow = (p: Period): MoneyWindow =>
  ({ start: p.start, end: p.end, key: p.key, transportStart: transportStartOf(p.start) });

function rangeLabel(start: Date, lastDay: Date): string {
  if (startOfDay(start).getTime() === startOfDay(lastDay).getTime()) return format(start, 'd MMM yyyy');
  const sameYear = start.getFullYear() === lastDay.getFullYear();
  return `${format(start, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(lastDay, 'd MMM yyyy')}`;
}

/** A closed cycle with explicit bounds. */
export function boundedPeriod(key: string, start: Date, end: Date): Period {
  const lastDay = startOfDay(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  return { key, start, end, lastDay, label: format(lastDay, 'MMMM yyyy'), range: rangeLabel(start, lastDay), short: format(start, 'd MMM') };
}

/** A pay-date cycle, by key. */
function autoPeriod(key: string, payDay: number): Period {
  const c = getPayCycle(payDay, cycleStartFromKey(key, payDay));
  return { key: c.key, start: c.start, end: c.end, lastDay: c.lastDay, label: format(c.lastDay, 'MMMM yyyy'), range: c.label, short: format(c.start, 'MMM') };
}

/** The open manual cycle: from its start through today. */
function openPeriod(key: string, start: Date, now: Date): Period {
  const end = add(startOfDay(now), { days: 1 });
  return {
    key, start, end,
    lastDay: startOfDay(now),
    label: format(now, 'MMMM yyyy'),
    range: `Since ${format(start, 'd MMM yyyy')}`,
    short: format(start, 'd MMM'),
  };
}

/** The cycle a History summary belongs to. Use this, never the cycle its `date` falls in: a
 *  manually closed cycle's summary is dated the moment it closed — the instant the next
 *  cycle began — so its date names the wrong one. */
export const snapshotKey = (h: HistoryEntry, payDay: number): string =>
  h.cycleKey ?? cycleKey(new Date(h.date), normalizePayDay(payDay));

/** Where every summary in History says its cycle ran, oldest first, one per key. Summaries
 *  sealed before cycles carried their own bounds are pay-date cycles, recovered from the
 *  date they were filed on (their cycle's last day) — exactly how screens always read them. */
function sealedPeriods(history: HistoryEntry[], payDay: number): Period[] {
  const byKey = new Map<string, Period>();
  for (const h of history) {
    if (h.type !== 'snapshot') continue;
    // Stored bounds win whenever they are not simply the pay-date cycle for that key — a
    // manual cycle can carry a month key (the one picked up by the switch to manual) yet
    // have closed early. One that IS its pay-date cycle reads like one ("October 2026",
    // month axis labels), however it was sealed.
    const key = snapshotKey(h, payDay);
    const auto = autoPeriod(key, payDay);
    const start = h.cycleStart ? new Date(h.cycleStart) : null;
    const end = h.cycleEnd ? new Date(h.cycleEnd) : null;
    const p = start && end && (start.getTime() !== auto.start.getTime() || end.getTime() !== auto.end.getTime())
      ? boundedPeriod(key, start, end)
      : auto;
    if (!byKey.has(p.key)) byKey.set(p.key, p);
  }
  return [...byKey.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function buildTimeline(src: CycleSource, now: Date = new Date()): CycleTimeline {
  const payDay = normalizePayDay(src.payDay);
  const sealed = sealedPeriods(src.history, payDay);
  const sealedByKey = new Map(sealed.map(p => [p.key, p]));

  // A key nothing on the timeline names — a savings entry filed against a cycle from before
  // a mode switch, say. Month keys are pay-date cycles; stamps are where a manual one began.
  const looseKey = (key: string): Period => {
    const known = sealedByKey.get(key);
    if (known) return known;
    if (isMonthKey(key)) return autoPeriod(key, payDay);
    const start = new Date(key);
    return Number.isNaN(start.getTime()) ? autoPeriod(cycleKey(now, payDay), payDay) : boundedPeriod(key, start, start);
  };

  if (src.mode === 'auto') {
    const c = getPayCycle(payDay, now);
    const current: Period = { key: c.key, start: c.start, end: c.end, lastDay: c.lastDay, label: format(c.lastDay, 'MMMM yyyy'), range: c.label, short: format(c.start, 'MMM') };
    // Stepping is pay-date maths; a stamp key (a cycle closed by hand before switching back)
    // steps from the pay-date cycle it started in.
    const asMonthKey = (key: string) => (isMonthKey(key) ? key : cycleKey(looseKey(key).start, payDay));
    let earliest = c.key;
    for (const h of src.history) {
      const k = cycleKey(new Date(h.date), payDay);
      if (k < earliest) earliest = k;
    }
    return {
      mode: 'auto',
      payDay,
      current,
      countdown: { daysLeft: c.daysLeft, progress: c.progress, resetsOn: c.end },
      canProject: true,
      period: key => (key === c.key ? current : isMonthKey(key) ? autoPeriod(key, payDay) : looseKey(key)),
      step: (key, dir) => stepCycleKey(asMonthKey(key), payDay, dir),
      keyOf: date => cycleKey(date, payDay),
      keysBetween: (a, b) => {
        const [lo, hi] = [asMonthKey(a), asMonthKey(b)].sort();
        const keys: string[] = [];
        // Keys are 'yyyy-MM' and compare chronologically as strings. The cap guards against a
        // malformed key that would never reach the far end, not against long spans.
        for (let k = lo, i = 0; k <= hi && i < 600; k = stepCycleKey(k, payDay, 1), i++) keys.push(k);
        return keys.length ? keys : [lo];
      },
      earliestKey: earliest,
      recent: back => listRecentCycles(payDay, back, now).map(p => (p.key === c.key ? current : autoPeriod(p.key, payDay))),
    };
  }

  // Manual: every closed cycle, then the open one. A summary at or after the open cycle's
  // start can only be a leftover of a cycle that was undone or re-filed; the open cycle wins.
  const openStart = new Date(src.manualCycleStart);
  const current = openPeriod(src.manualCycleKey, openStart, now);
  const list = [...sealed.filter(p => p.key !== current.key && p.start < openStart), current];
  const indexOf = (key: string) => list.findIndex(p => p.key === key);
  const keyOf = (date: Date) => {
    let hit = list[0].key;
    for (const p of list) if (p.start <= date) hit = p.key;
    return hit;
  };
  // A key off the list is placed by its start, so stepping from it still lands somewhere real.
  const position = (key: string) => {
    const i = indexOf(key);
    return i >= 0 ? i : indexOf(keyOf(looseKey(key).start));
  };
  return {
    mode: 'manual',
    payDay,
    current,
    countdown: null,
    canProject: false,
    period: key => (key === current.key ? current : looseKey(key)),
    step: (key, dir) => list[Math.min(list.length - 1, Math.max(0, position(key) + dir))].key,
    keyOf,
    keysBetween: (a, b) => {
      const [lo, hi] = [position(a), position(b)].sort((x, y) => x - y);
      return list.slice(lo, hi + 1).map(p => p.key);
    },
    earliestKey: list[0].key,
    recent: back => list.slice(-(back + 1)).reverse(),
  };
}
