'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { add, format, getDaysInMonth, startOfDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarRange, PieChart, BarChart3 } from 'lucide-react';
import { buildAnalogous, cn, formatCurrency } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CardHeading } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { cycleKey, cycleStartFromKey, getPayCycle, listRecentCycles, type MonthlyMoney } from '@/lib/calculations';
import { AppDataContext } from '@/context/AppDataContext';

/**
 * The Stats page's charts, all hand-drawn from the app's own primitives — no chart
 * library. Every fill is the same animated gradient bar the Debts page and the Balance
 * cycle hairline use (`bar-animated`, a 700ms width/height ease armed by
 * useReplayOnActive), and every colour is an existing theme token, so a chart repaints
 * with the user's theme like everything else.
 *
 * All three read the same shape: one MonthlyMoney per pay cycle. The current cycle's
 * comes from the live calculator, sealed ones from their history snapshot — so a chart
 * never invents a figure that some card elsewhere disagrees with.
 */

/** One cycle on the timeline, oldest first. */
export interface CyclePoint {
  key: string;
  label: string;
  /** True for the cycle still running — its figures move, the sealed ones never do. */
  live: boolean;
  /** Whether anything actually happened in this cycle: it is live, it has a stored
   *  snapshot, or something was spent in it. False for cycles that predate your data,
   *  whose figures are recomputed from today's salary and mean nothing. */
  recorded: boolean;
  money: MonthlyMoney;
}

/** Short axis label for a cycle: the month its pay date falls in. */
const shortLabel = (key: string, payDay: number) => format(cycleStartFromKey(key, payDay), 'MMM');

/** Fewest points worth drawing a line through. A one- or two-cycle selection is padded out
 *  to this with its neighbours; a span wider than it draws every cycle it covers. */
const MIN_LINE_POINTS = 6;

/**
 * What the page is currently reporting on: one cycle, or a span of them. A single cycle is
 * just the span whose ends are the same key — every consumer reads `money`, which is the
 * span summed, so nothing downstream has to know which case it is looking at.
 */
export interface CycleSelection {
  fromKey: string;
  toKey: string;
  /** Every cycle key in the span, oldest first. Length 1 for a single cycle. */
  keys: string[];
  label: string;
  /** The span includes the cycle still running, so its figures can still move. */
  live: boolean;
  recorded: boolean;
  money: MonthlyMoney;
}

const ZERO_MONEY: MonthlyMoney = {
  income: 0, transport: 0, uber: 0, debt: 0, expenses: 0, budget: 0, savings: 0,
  totalOutgoings: 0, remaining: 0,
};

/** Several cycles as one. Every field is a flow over a window, so they all simply add —
 *  including `remaining`, where the sum is what the whole span actually kept. */
export function sumMonthlyMoney(list: MonthlyMoney[]): MonthlyMoney {
  return list.reduce<MonthlyMoney>((a, m) => ({
    income:         a.income + m.income,
    transport:      a.transport + m.transport,
    uber:           a.uber + m.uber,
    debt:           a.debt + m.debt,
    expenses:       a.expenses + m.expenses,
    budget:         a.budget + m.budget,
    savings:        a.savings + m.savings,
    totalOutgoings: a.totalOutgoings + m.totalOutgoings,
    remaining:      a.remaining + m.remaining,
  }), ZERO_MONEY);
}

// The outgoing categories, in the order they stack — biggest, most fixed commitments
// first so the bar reads left-to-right as "what was already spoken for".
const SEGMENTS: { id: keyof MonthlyMoney; label: string; color: string }[] = [
  { id: 'transport', label: 'Transport', color: 'hsl(var(--cat-transport))' },
  { id: 'uber',      label: 'Uber / rides', color: 'hsl(var(--cat-transport) / 0.55)' },
  { id: 'debt',      label: 'Debt payments', color: 'hsl(var(--cat-budget))' },
  { id: 'expenses',  label: 'Expenses', color: 'hsl(var(--cat-expense))' },
  { id: 'budget',    label: 'Budget', color: 'hsl(var(--cat-completion))' },
  { id: 'savings',   label: 'Savings', color: 'hsl(var(--cat-snapshot))' },
];

// ─── Cycle navigator (picker + trend, one card) ───────────────────────────────

/** The cycle one step either side of `key`. Date maths, not array indices, so stepping is
 *  not bounded by whatever window the chart happens to be drawing. */
export const stepCycleKey = (key: string, payDay: number, dir: -1 | 1): string => {
  const c = getPayCycle(payDay, cycleStartFromKey(key, payDay));
  // `end` is exclusive — it IS the next cycle's first day. One day before `start` is the
  // last day of the previous cycle.
  return dir === 1 ? cycleKey(c.end, payDay) : cycleKey(add(c.start, { days: -1 }), payDay);
};

/** Every cycle key from one end of a span to the other, inclusive and oldest first. Keys
 *  are 'yyyy-MM', so they compare chronologically as strings; ends the wrong way round are
 *  swapped rather than yielding nothing. The step cap is a guard against a malformed key
 *  that would never reach the far end, not a limit on how long a span may be. */
export function cycleKeysBetween(fromKey: string, toKey: string, payDay: number): string[] {
  const [lo, hi] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
  const keys: string[] = [];
  for (let k = lo, i = 0; k <= hi && i < 600; k = stepCycleKey(k, payDay, 1), i++) keys.push(k);
  return keys.length ? keys : [lo];
}

/**
 * The date picker for a page whose unit of time is the pay cycle, and the chart that gives
 * it context — one card, because they are one control. Chevrons step a cycle at a time,
 * the columns jump to one you can see, and the label opens a real date picker for
 * everything else. All three set the same cycle key.
 */
export function CycleNavigatorCard({ selected, points, liveKey, payDay, onSelectRange, ready }: {
  /** The cycle, or span of cycles, currently on screen. May sit outside `points`. */
  selected: CycleSelection;
  /** Rolling window, oldest first — the trend chart's data, not the selection's range. */
  points: CyclePoint[];
  liveKey: string;
  payDay: number;
  /** Both keys the same = a single cycle, which is what stepping and tapping a column give. */
  onSelectRange: (fromKey: string, toKey: string) => void;
  ready: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  const span = selected.keys.length;
  const selectedKeys = useMemo(() => new Set(selected.keys), [selected.keys]);

  // Stepping moves the whole window with its span intact: "previous" for a three-cycle
  // range means the three before it, not a collapse back to one.
  const step = (dir: -1 | 1) => onSelectRange(
    stepCycleKey(selected.fromKey, payDay, dir),
    stepCycleKey(selected.toKey, payDay, dir),
  );

  // What the line draws: the cycles you asked for, whatever span that is.
  //
  // Only cycles that actually happened are eligible. A cycle from before you had data still
  // recomputes an income from your CURRENT salary, which would draw a full-height empty
  // column for a month the app never saw — worse than nothing, because it reads as a month
  // you spent nothing in.
  //
  // A narrow selection is padded with its neighbours rather than drawn as one lonely dot: a
  // single cycle has no shape, and the point of the chart is what the figure looks like
  // NEXT to the ones around it. The selection stays marked (band + filled dots) either way,
  // so padding never hides which cycles the figures above actually cover.
  const columns = useMemo(() => {
    const real = points.filter(p => p.recorded);
    if (real.length === 0) return [];

    const flags = real.map(p => selectedKeys.has(p.key));
    let lo = flags.indexOf(true);
    let hi = flags.lastIndexOf(true);
    // Selection outside the recorded range (a span reaching back before your data): fall
    // back to the most recent stretch so the card still says something.
    if (lo < 0) return real.slice(Math.max(0, real.length - MIN_LINE_POINTS));

    while (hi - lo + 1 < MIN_LINE_POINTS && (lo > 0 || hi < real.length - 1)) {
      if (lo > 0) lo -= 1;
      if (hi - lo + 1 < MIN_LINE_POINTS && hi < real.length - 1) hi += 1;
    }
    return real.slice(lo, hi + 1);
  }, [points, selectedKeys]);

  // Averaged over the SELECTION, not over what is drawn: the padding either side of a
  // narrow selection is context for the eye, and quoting a figure that included it would
  // disagree with the summary card directly below.
  const avgSpend = useMemo(() => {
    const inSelection = columns.filter(p => selectedKeys.has(p.key));
    const basis = inSelection.length ? inSelection : columns;
    return basis.length ? basis.reduce((s, p) => s + p.money.totalOutgoings, 0) / basis.length : 0;
  }, [columns, selectedKeys]);

  return (
    <div className="bg-card rounded-2xl p-1.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => step(-1)}
          aria-label={span > 1 ? 'Previous cycles' : 'Previous cycle'}
          className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-25 active:bg-muted/60"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Stepping is fine for last month and useless for a date two years back, so the
            label opens a calendar you tap through — day, month, then year. */}
        <button onClick={() => setPickerOpen(true)} className="flex-1 min-w-0 px-1 text-center">
          <p className="text-xs font-semibold text-foreground truncate flex items-center justify-center gap-1.5">
            <CalendarRange className="h-3 w-3 text-accent shrink-0" />
            {selected.label}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">
            {span > 1
              ? `${span} cycles · tap to change`
              : selected.live ? 'This cycle · still running' : 'Sealed · tap to pick dates'}
          </p>
        </button>

        <button
          onClick={() => step(1)}
          disabled={selected.toKey >= liveKey}
          aria-label={span > 1 ? 'Next cycles' : 'Next cycle'}
          className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-25 active:bg-muted/60"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Always here, open or shut — it vanishing when there was nothing to draw read as
          the app losing the feature. Shut, it is one line; open, it is the history. */}
      <div className="mt-1 border-t border-border/40">
        <button
          onClick={() => setHistoryOpen(v => !v)}
          aria-expanded={historyOpen}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
        >
          <BarChart3 className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Spent per cycle
          </span>
          {columns.length >= 2 && (
            <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground">
              avg {formatCurrency(avgSpend)}
            </span>
          )}
          <ChevronDown className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200',
            columns.length >= 2 ? 'ml-2' : 'ml-auto',
            historyOpen && 'rotate-180',
          )} />
        </button>

        <AnimatePresence initial={false}>
          {historyOpen && (
            <motion.div
              key="cycle-history"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 }}
              className="overflow-hidden"
            >
              <div className="px-2.5 pb-2">
                {columns.length >= 2 ? (
                  <SpendLine points={columns} selectedKeys={selectedKeys} payDay={payDay}
                             onSelectKey={key => onSelectRange(key, key)} ready={ready} />
                ) : (
                  <p className="text-[10px] text-muted-foreground/60 pb-2">
                    Not enough history yet, each cycle joins the line as it ends.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CycleRangePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        payDay={payDay}
        fromDate={cycleStartFromKey(selected.fromKey, payDay)}
        // The far end seeds from the last day the span covers — but never a future one, so
        // reopening the picker on the running cycle starts from today, not from pay day.
        toDate={minDate(getPayCycle(payDay, cycleStartFromKey(selected.toKey, payDay)).lastDay, new Date())}
        onPick={(a, b) => { onSelectRange(a, b); setPickerOpen(false); }}
      />
    </div>
  );
}


/**
 * Spend per cycle as a plain time series — the shape a price chart uses, because the
 * question is the same one: is this going up. Zero-based, so a rise is a real rise and not
 * a rescaled y-axis; one line, no gridlines, no second series, because a second line would
 * make it a thing to study rather than a thing to glance at.
 *
 * Drawn straight into an SVG at a fixed viewBox that scales to the card — no chart
 * library, same as everything else on this page.
 */
function SpendLine({ points, selectedKeys, payDay, onSelectKey, ready }: {
  points: CyclePoint[];
  /** Every cycle in the selection — a span highlights all of its columns, not just an end. */
  selectedKeys: Set<string>;
  payDay: number;
  onSelectKey: (key: string) => void;
  ready: boolean;
}) {
  const W = 320, H = 96, PAD_X = 10, PAD_TOP = 10, BASE = H - 18;

  const values = points.map(p => p.money.totalOutgoings);
  const max = Math.max(...values, 1);
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (BASE - PAD_TOP);

  const line = points.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${BASE} L${x(0).toFixed(1)},${BASE} Z`;
  const firstSelIdx = points.findIndex(p => selectedKeys.has(p.key));
  const lastSelIdx = points.length - 1 - [...points].reverse().findIndex(p => selectedKeys.has(p.key));
  // Marking the selection only says something when there is something else to tell it
  // apart FROM. Select the whole window — which is what picking a wide span does — and the
  // emphasis marks every point, which is a caterpillar of fat dots under a wash, and no
  // more informative than the plain line.
  const allSelected = firstSelIdx === 0 && lastSelIdx === points.length - 1;
  // Dots stop being marks and start being noise once they touch. Past that the line alone
  // carries the shape, which is the whole message at this width.
  const showDots = points.length <= 14;
  const bandFrom = firstSelIdx >= 0 ? x(firstSelIdx) : 0;
  const bandTo = firstSelIdx >= 0 ? x(lastSelIdx) : 0;
  const showBand = firstSelIdx >= 0 && lastSelIdx > firstSelIdx && !allSelected;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Spent per cycle">
      <defs>
        <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Baseline: zero, and the only rule on the chart. */}
      <line x1={PAD_X} y1={BASE} x2={W - PAD_X} y2={BASE} stroke="hsl(var(--border))" strokeWidth="1" />

      {/* The selected span, behind everything — a wash rather than an outline, so it reads
          as "these ones" without competing with the line itself. */}
      {showBand && (
        <rect
          x={bandFrom} y={0} width={Math.max(2, bandTo - bandFrom)} height={BASE}
          rx="3" fill="hsl(var(--primary) / 0.12)" pointerEvents="none"
        />
      )}

      <path d={area} fill="url(#spend-fill)" pointerEvents="none" opacity={ready ? 1 : 0}
            style={{ transition: ready ? 'opacity 700ms ease' : undefined }} />

      {/* The line draws itself in on arrival, the same 700ms the bars fill on. */}
      <path
        d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" pointerEvents="none"
        strokeLinecap="round" strokeLinejoin="round" pathLength={1}
        strokeDasharray={1} strokeDashoffset={ready ? 0 : 1}
        style={{ transition: ready ? 'stroke-dashoffset 700ms ease' : undefined }}
      />

      {/* Dots are decoration and must not eat taps — in SVG the last thing painted wins,
          and a 2px circle sitting over the hit area meant tapping a point you can SEE did
          nothing while tapping beside it worked. Marks first, hit areas last. */}
      {points.map((p, i) => {
        const isSelected = selectedKeys.has(p.key) && !allSelected;
        // A dense window keeps only the marks that mean something: the ends of a selection
        // that is narrower than what is drawn.
        if (!showDots && !isSelected) return null;
        return (
          <circle
            key={p.key}
            cx={x(i)} cy={y(values[i])} r={isSelected ? 3.5 : 2}
            fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
            stroke="hsl(var(--primary))" strokeWidth={isSelected ? 2 : 1.5}
            opacity={ready ? 1 : 0} pointerEvents="none"
            style={{ transition: ready ? 'opacity 700ms ease' : undefined }}
          />
        );
      })}

      {/* One full-height column per point: a 3px dot is not a touch target on a phone. */}
      {points.map((p, i) => (
        <rect
          key={`hit-${p.key}`}
          x={x(i) - (W - PAD_X * 2) / (points.length * 2)} y={0}
          width={(W - PAD_X * 2) / points.length} height={BASE}
          fill="transparent" style={{ cursor: 'pointer' }}
          onClick={() => onSelectKey(p.key)}
        >
          <title>{`${p.label}: ${formatCurrency(values[i])}`}</title>
        </rect>
      ))}

      {/* Only the ends and the selection are labelled — a label per point is clutter at
          this width, and the selected cycle is named in full above anyway. */}
      {points.map((p, i) => {
        if (i !== 0 && i !== points.length - 1 && i !== firstSelIdx && i !== lastSelIdx) return null;
        const inSelection = selectedKeys.has(p.key) && !allSelected;
        return (
          <text
            key={p.key} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            className={cn('text-[9px]', inSelection ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}
            style={{ fontSize: 9 }}
          >
            {shortLabel(p.key, payDay)}
          </text>
        );
      })}
    </svg>
  );
}

/** The three numbers a date is picked as. Kept apart from `Date` so a half-set month never
 *  rolls the year over behind the user's back. */
interface DateParts { y: number; m: number; d: number }

const toParts = (d: Date): DateParts => ({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
/** February exists: clamp the day rather than letting `new Date(2026, 1, 31)` walk into March. */
const partsToDate = ({ y, m, d }: DateParts): Date =>
  new Date(y, m, Math.min(d, getDaysInMonth(new Date(y, m, 1))));
const minDate = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

/**
 * Pick the span the page reports on: a FROM date and a TO date, each resolved to the pay
 * cycle it falls in. A cycle boundary is not a date anyone remembers ("was the 24th in
 * July's pay or August's?"), so you name days you DO remember and the cycles they resolve
 * to are spelled out below before you commit to them.
 *
 * Two dates inside the same cycle are one cycle — the picker's original behaviour, which
 * is still the common case, so the presets put it one tap away. Dates entered the wrong way
 * round are swapped rather than treated as an empty span, and a TO date in the future is
 * pulled back to today: cycles that have not happened would otherwise be summed from
 * today's salary and read as real.
 */
function CycleRangePickerDialog({ open, onOpenChange, payDay, fromDate, toDate, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payDay: number;
  /** Seed for the near end — the start of the first cycle currently showing. */
  fromDate: Date;
  /** Seed for the far end — the last day of the last cycle showing, capped at today. */
  toDate: Date;
  onPick: (fromKey: string, toKey: string) => void;
}) {
  const [from, setFrom] = useState<DateParts>(() => toParts(fromDate));
  const [to, setTo] = useState<DateParts>(() => toParts(toDate));
  /** Which end the calendar is filling in. */
  const [editing, setEditing] = useState<'from' | 'to'>('from');

  // Re-seed each time it opens, so it always starts from what you are looking at.
  useEffect(() => {
    if (!open) return;
    setFrom(toParts(fromDate));
    setTo(toParts(toDate));
    setEditing('from');
  }, [open, fromDate, toDate]);

  const today = startOfDay(new Date());

  const a = partsToDate(from);
  const b = partsToDate(to);
  const lo = minDate(a, b);
  const hi = minDate(a.getTime() > b.getTime() ? a : b, today);
  const startCycle = getPayCycle(payDay, lo);
  const endCycle = getPayCycle(payDay, hi);
  const span = cycleKeysBetween(startCycle.key, endCycle.key, payDay).length;
  // Only a span that begins in the future has nothing at all to show.
  const future = startOfDay(lo) > today;

  const applyPreset = (n: number) => {
    const list = listRecentCycles(payDay, n - 1);          // newest first, n entries
    setFrom(toParts(list[list.length - 1].start));
    setTo(toParts(new Date()));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pick a date range</DialogTitle>
          <DialogDescription>Covers every pay cycle these dates touch.</DialogDescription>
        </DialogHeader>

        {/* The spans people actually ask for, without picking two dates to get them. */}
        <div className="flex gap-1.5">
          {[{ label: 'This cycle', n: 1 }, { label: 'Last 3', n: 3 }, { label: 'Last 6', n: 6 }, { label: 'Last 12', n: 12 }].map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.n)}
              className={cn(
                'flex-1 h-7 rounded-lg text-[10px] font-semibold transition-colors',
                span === p.n && endCycle.key === getPayCycle(payDay).key
                  ? 'bg-accent text-btn-on-accent'
                  : 'bg-muted/40 text-muted-foreground active:bg-muted/70',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* One calendar, two ends. Tapping an end arms it; picking a day fills it and hands
            the calendar to the other end, so the ordinary case — from, then to — is two
            taps and no mode switching to think about. */}
        <div className="grid grid-cols-2 gap-2">
          <EndTab
            label="From"
            date={a}
            active={editing === 'from'}
            onClick={() => setEditing('from')}
          />
          <EndTab
            label="To"
            date={b}
            active={editing === 'to'}
            onClick={() => setEditing('to')}
          />
        </div>

        <Calendar
          value={editing === 'from' ? a : b}
          max={today}
          onSelect={(d, via) => {
            if (editing === 'from') {
              setFrom(toParts(d));
              // A tap on the grid means that end is settled — hand the calendar to the
              // other one. A quick-jump nudge is still aimed at THIS end, so it stays.
              if (via === 'day') setEditing('to');
            } else {
              setTo(toParts(d));
            }
          }}
        />

        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {span === 1 ? 'Those dates fall in' : `${span} pay cycles`}
          </p>
          <p className="text-sm font-semibold text-foreground mt-1">
            {span === 1
              ? startCycle.label
              : `${format(startCycle.start, 'd MMM yyyy')} – ${format(endCycle.lastDay, 'd MMM yyyy')}`}
          </p>
          {future && (
            <p className="text-[10px] text-[hsl(var(--negative))] mt-1">
              That range hasn&apos;t happened yet.
            </p>
          )}
          {!future && hi.getTime() !== b.getTime() && (
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Ends today — later cycles haven&apos;t happened yet.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onPick(startCycle.key, endCycle.key)}
            disabled={future}
            className="w-full h-9 text-xs"
          >
            {span === 1 ? 'Show this cycle' : `Show these ${span} cycles`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One end of the range: which end it is, the day it currently holds, and whether the
 *  calendar below is filling it in. */
function EndTab({ label, date, active, onClick }: {
  label: string; date: Date; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl px-3 py-2 text-left transition-colors',
        active ? 'bg-accent/15 ring-1 ring-accent' : 'bg-muted/30 active:bg-muted/50',
      )}
    >
      <p className={cn(
        'text-[10px] font-bold uppercase tracking-widest',
        active ? 'text-accent' : 'text-muted-foreground',
      )}>
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
        {format(date, 'd MMM yyyy')}
      </p>
    </button>
  );
}

// ─── Where the money went ─────────────────────────────────────────────────────

/**
 * One cycle's income, divided. The bar is the whole pay: each outgoing takes its share and
 * whatever survives is the tail in the positive colour — so "how much of this pay is still
 * mine" is a glance, not a subtraction. The legend under it carries the amounts, which is
 * what the plain row list used to do on its own.
 */
export function SpendBreakdownCard({ money, ready }: { money: MonthlyMoney; ready: boolean }) {
  const { themeSettings } = useContext(AppDataContext);
  const kept = Math.max(0, money.remaining);
  // Over-spent cycles have no room for a "kept" tail, and the shares must still add to the
  // bar's width — so the denominator becomes what was actually spent.
  const total = money.income > 0 && money.remaining >= 0 ? money.income : money.totalOutgoings;

  const parts = useMemo(() => {
    const rows = SEGMENTS
      .map(s => ({ ...s, value: money[s.id] as number }))
      .filter(s => s.value > 0);
    if (kept > 0) rows.push({ id: 'remaining', label: 'Left over', color: 'hsl(var(--positive))', value: kept });
    return rows;
  }, [money, kept]);

  // This legend IS the key — a reader matches a swatch to a bar segment — so it takes the
  // same theme-driven analogous family the budget rings use, opened up: the hues fan across
  // a ~130 degree band around --primary (capped so a two-row cycle does not land on opposite
  // sides of the wheel) with a wider lightness walk, so neighbours never read as one colour.
  // Rotating with the theme is the point: recolour the app and this recolours with it.
  const colors = useMemo(() => {
    const n = parts.length;
    const spread = n > 1 ? Math.min(42, 130 / (n - 1)) : 0;
    return buildAnalogous(themeSettings.primary, n, spread, 9);
  }, [themeSettings.primary, parts.length]);

  if (total <= 0 || parts.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-4">
        <CardHeading icon={PieChart} title="Where it goes" />
        {/* Deliberately span-agnostic wording: this card is fed one cycle or a dozen. */}
        <p className="text-xs text-muted-foreground py-3 text-center">
          Nothing recorded here yet.
        </p>
      </div>
    );
  }

  const overspent = money.remaining < 0;

  return (
    <div className="bg-card rounded-2xl p-4">
      <CardHeading
        icon={PieChart}
        title="Where it goes"
        aside={overspent ? 'over budget' : `${Math.round((kept / total) * 100)}% kept`}
        asideClassName={overspent ? 'text-[hsl(var(--negative))]' : 'text-[hsl(var(--positive))]'}
      />

      {/* Segments animate their width in from zero on every visit, the same 700ms ease the
          debt bars use. Widths are percentages of one flex row rather than a stacked SVG so
          the whole thing stays one compositor-friendly layer. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary mt-1">
        {parts.map((p, i) => (
          <div
            key={p.id}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
            style={{ width: `${ready ? (p.value / total) * 100 : 0}%`, background: colors[i] }}
          />
        ))}
      </div>

      <div className="mt-3 space-y-0.5">
        {parts.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 py-1">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colors[i] }} />
            <p className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{p.label}</p>
            <p className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0 w-9 text-right">
              {Math.round((p.value / total) * 100)}%
            </p>
            <p className="text-xs font-semibold tabular-nums text-foreground shrink-0">
              {formatCurrency(p.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Saved per cycle ──────────────────────────────────────────────────────────

/**
 * The Savings tab's ledger answers "what did I keep, and when". This answers the question
 * the ledger cannot: is the pile growing. One point per cycle, drawn as the same line the
 * navigator uses for spending — the shape of the trend is the whole message, and a line
 * carries it where a row of stacked columns only carried the last one or two.
 *
 * The split between swept and deliberate money lives in the hero's bar above, which is
 * where a total belongs; repeating it here cost the line its legibility.
 */
export function SavingsTrendCard({ cycles, payDay, ready }: {
  /** Oldest first. */
  cycles: { key: string; manual: number; auto: number }[];
  payDay: number;
  ready: boolean;
}) {
  const window = useMemo(() => cycles.slice(Math.max(0, cycles.length - 12)), [cycles]);
  const totals = window.map(c => c.manual + c.auto);
  const peak = Math.max(...totals, 1);

  if (window.length < 2) return null;

  return (
    <div className="bg-card rounded-2xl p-4">
      <CardHeading
        icon={BarChart3}
        title="Saved per cycle"
        aside={`peak ${formatCurrency(peak)}`}
      />
      {/* The same line the cycle navigator draws for spending, in the savings colour: two
          charts a swipe apart that answer "how has this moved" should be read the same way. */}
      <TrendLine
        points={window.map((c, i) => ({ key: c.key, value: totals[i] }))}
        payDay={payDay}
        ready={ready}
        color="hsl(var(--positive))"
        gradientId="saved-fill"
        label="Saved per cycle"
      />
    </div>
  );
}

/**
 * A bare version of the navigator's spend line — same geometry, same 700ms self-drawing
 * stroke, no selection or hit targets. For charts that are read rather than driven.
 */
function TrendLine({ points, payDay, ready, color, gradientId, label }: {
  points: { key: string; value: number }[];
  payDay: number;
  ready: boolean;
  color: string;
  gradientId: string;
  label: string;
}) {
  const W = 320, H = 96, PAD_X = 10, PAD_TOP = 10, BASE = H - 18;
  const max = Math.max(...points.map(p => p.value), 1);
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (BASE - PAD_TOP);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${BASE} L${x(0).toFixed(1)},${BASE} Z`;
  const peakIdx = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <line x1={PAD_X} y1={BASE} x2={W - PAD_X} y2={BASE} stroke="hsl(var(--border))" strokeWidth="1" />

      <path d={area} fill={`url(#${gradientId})`} opacity={ready ? 1 : 0}
            style={{ transition: ready ? 'opacity 700ms ease' : undefined }} />

      <path
        d={line} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" pathLength={1}
        strokeDasharray={1} strokeDashoffset={ready ? 0 : 1}
        style={{ transition: ready ? 'stroke-dashoffset 700ms ease' : undefined }}
      />

      {points.map((p, i) => (
        <circle
          key={p.key}
          cx={x(i)} cy={y(p.value)} r={i === peakIdx ? 3.5 : 2}
          fill={i === peakIdx ? color : 'hsl(var(--background))'}
          stroke={color} strokeWidth={i === peakIdx ? 2 : 1.5}
          opacity={ready ? 1 : 0}
          style={{ transition: ready ? 'opacity 700ms ease' : undefined }}
        >
          <title>{`${shortLabel(p.key, payDay)}: ${formatCurrency(p.value)}`}</title>
        </circle>
      ))}

      {/* Ends and the peak only — a label per point is unreadable at this width. */}
      {points.map((p, i) => {
        if (i !== 0 && i !== points.length - 1 && i !== peakIdx) return null;
        return (
          <text
            key={p.key} x={x(i)} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            className={cn('text-[9px]', i === peakIdx ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}
            style={{ fontSize: 9 }}
          >
            {shortLabel(p.key, payDay)}
          </text>
        );
      })}
    </svg>
  );
}


