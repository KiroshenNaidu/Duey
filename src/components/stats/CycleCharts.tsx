'use client';

import { useEffect, useMemo, useState } from 'react';
import { add, format, getDaysInMonth, startOfDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarRange, PieChart, BarChart3 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cycleKey, cycleStartFromKey, getPayCycle, listRecentCycles, type MonthlyMoney } from '@/lib/calculations';

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

  // Only cycles that actually happened. A cycle from before you had data still recomputes
  // an income from your CURRENT salary, which would draw a full-height empty column for a
  // month the app never saw — worse than nothing, because it reads as a month you spent
  // nothing in.
  const columns = useMemo(() => {
    const real = points.filter(p => p.recorded);
    return real.slice(Math.max(0, real.length - 12));
  }, [points]);

  const avgSpend = columns.length
    ? columns.reduce((s, p) => s + p.money.totalOutgoings, 0) / columns.length
    : 0;

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
            label opens a picker where the day, month and year are each set directly. */}
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
                    Not enough history yet — each cycle joins the line as it ends.
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
  // A span is worth shading: the line then says which stretch of it the figures above cover.
  const bandFrom = firstSelIdx >= 0 ? x(firstSelIdx) : 0;
  const bandTo = firstSelIdx >= 0 ? x(lastSelIdx) : 0;
  const showBand = firstSelIdx >= 0 && lastSelIdx > firstSelIdx;

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
        const isSelected = selectedKeys.has(p.key);
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
        const inSelection = selectedKeys.has(p.key);
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

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

  // Re-seed each time it opens, so it always starts from what you are looking at.
  useEffect(() => {
    if (!open) return;
    setFrom(toParts(fromDate));
    setTo(toParts(toDate));
  }, [open, fromDate, toDate]);

  const today = startOfDay(new Date());
  const years = useMemo(() => {
    const now = today.getFullYear();
    return Array.from({ length: 11 }, (_, i) => now - 10 + i);
  }, [today]);

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

        {/* The spans people actually ask for, without setting six fields to get them. */}
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

        <div className="space-y-2.5">
          <DateRow label="From" value={from} onChange={setFrom} years={years} />
          <DateRow label="To" value={to} onChange={setTo} years={years} />
        </div>

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

/** One labelled date, as day / month / year set independently. */
function DateRow({ label, value, onChange, years }: {
  label: string;
  value: DateParts;
  onChange: (parts: DateParts) => void;
  years: number[];
}) {
  const daysInMonth = getDaysInMonth(new Date(value.y, value.m, 1));
  const safeDay = Math.min(value.d, daysInMonth);

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <Select value={String(safeDay)} onValueChange={v => onChange({ ...value, d: Number(v) })}>
          <SelectTrigger className="h-9 text-xs" aria-label={`${label} day`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
              <SelectItem key={d} value={String(d)} className="text-xs">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(value.m)} onValueChange={v => onChange({ ...value, m: Number(v) })}>
          <SelectTrigger className="h-9 text-xs" aria-label={`${label} month`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i)} className="text-xs">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(value.y)} onValueChange={v => onChange({ ...value, y: Number(v) })}>
          <SelectTrigger className="h-9 text-xs" aria-label={`${label} year`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
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
        asideColor={overspent ? 'text-[hsl(var(--negative))]' : 'text-[hsl(var(--positive))]'}
      />

      {/* Segments animate their width in from zero on every visit, the same 700ms ease the
          debt bars use. Widths are percentages of one flex row rather than a stacked SVG so
          the whole thing stays one compositor-friendly layer. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary mt-1">
        {parts.map(p => (
          <div
            key={p.id}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', ready && 'transition-[width] duration-700')}
            style={{ width: `${ready ? (p.value / total) * 100 : 0}%`, background: p.color }}
          />
        ))}
      </div>

      <div className="mt-3 space-y-0.5">
        {parts.map(p => (
          <div key={p.id} className="flex items-center gap-2 py-1">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
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
 * the ledger cannot: is the pile growing. Each column is one cycle's total, split by how
 * the money got there — put away on purpose (bottom) versus left over and swept (top) —
 * which makes the tab's whole premise visible: for most cycles the top half is the story.
 */
export function SavingsTrendCard({ cycles, payDay, ready }: {
  /** Oldest first. */
  cycles: { key: string; manual: number; auto: number }[];
  payDay: number;
  ready: boolean;
}) {
  const window = useMemo(() => cycles.slice(Math.max(0, cycles.length - 6)), [cycles]);
  const max = Math.max(...window.map(c => c.manual + c.auto), 1);

  if (window.length < 2) return null;

  return (
    <div className="bg-card rounded-2xl p-4">
      <CardHeading
        icon={BarChart3}
        title="Saved per cycle"
        aside={`peak ${formatCurrency(max)}`}
      />

      <div className="flex items-end gap-1.5 h-20 mt-2">
        {window.map(c => (
          <div key={c.key} className="flex-1 min-w-0 h-full flex flex-col items-stretch gap-1.5">
            <div className="relative flex-1 rounded-md overflow-hidden bg-secondary">
              {/* One stack, drawn bottom-up: manual sits under the swept leftover so the
                  two are always in the same order to compare across columns. */}
              <div
                className={cn('absolute inset-x-0 bottom-0 flex flex-col justify-end', ready && 'transition-[height] duration-700')}
                style={{ height: `${ready ? ((c.manual + c.auto) / max) * 100 : 0}%` }}
              >
                {c.auto > 0 && (
                  <div className="w-full rounded-t-md" style={{ height: `${(c.auto / (c.manual + c.auto)) * 100}%`, background: 'hsl(var(--positive))' }} />
                )}
                {c.manual > 0 && (
                  <div className="w-full" style={{ height: `${(c.manual / (c.manual + c.auto)) * 100}%`, background: 'hsl(var(--cat-snapshot))' }} />
                )}
              </div>
            </div>
            <span className="text-[9px] tabular-nums text-muted-foreground/60 text-center">
              {shortLabel(c.key, payDay)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-2.5">
        <Key color="hsl(var(--positive))" label="Left over" />
        <Key color="hsl(var(--cat-snapshot))" label="Put away" />
      </div>
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
  );
}

// ─── shared ───────────────────────────────────────────────────────────────────

function CardHeading({ icon: Icon, title, aside, asideColor }: {
  icon: React.ElementType;
  title: string;
  aside?: string;
  asideColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-4 w-4 text-accent shrink-0" />
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {aside && (
        <span className={cn('ml-auto text-[10px] font-semibold tabular-nums', asideColor ?? 'text-muted-foreground')}>
          {aside}
        </span>
      )}
    </div>
  );
}
