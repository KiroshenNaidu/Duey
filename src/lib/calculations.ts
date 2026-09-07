import type {
  Debt, HistoryEntry, TransportOverrides, TransportSettings, DayState,
  Expense, ExtraIncome, BudgetPlan, UberRide, TransportMonthlyOverrides, SavingEntry,
} from './types';
import { isWeekend, getDaysInMonth, startOfMonth, startOfDay, add, isSameMonth, format, differenceInCalendarDays } from 'date-fns';

// Debt Calculations
export const getAmountPaid = (debt: Debt, history: HistoryEntry[]): number => {
    return history
        .filter(h => h.debtId === debt.id && h.type === 'payment')
        .reduce((acc, p) => acc + p.amount, 0);
};

export const getPaymentCount = (debt: Debt, history: HistoryEntry[]): number => {
    return history.filter(h => h.debtId === debt.id && h.type === 'payment').length;
};

export const getTotalInstallments = (debt: Debt): number => {
    // A non-finite or non-positive installment (a cleared/garbage input that reached
    // storage) would otherwise produce Infinity/NaN and render as "3 of NaN".
    if (!Number.isFinite(debt.installment_amount) || debt.installment_amount <= 0) return 0;
    if (!Number.isFinite(debt.total_owed) || debt.total_owed <= 0) return 0;
    return Math.ceil(debt.total_owed / debt.installment_amount);
};

export const getRemainingBalance = (debt: Debt, history: HistoryEntry[]): number => {
    return Math.max(0, debt.total_owed - getAmountPaid(debt, history));
};

export const getProgress = (debt: Debt, history: HistoryEntry[]): number => {
    if (debt.total_owed <= 0) {
        return getAmountPaid(debt, history) > 0 ? 100 : 0;
    };
    const amountPaid = getAmountPaid(debt, history);
    const progress = (amountPaid / debt.total_owed) * 100;
    return Math.min(100, progress);
};

// Percentages shown next to real amounts must never lie about the two states people
// actually check: "untouched" and "done". Plain Math.round turns 99.6% into "100%" on a
// debt that still owes money, and 0.4% into "0%" on one that's been paid. Clamp the
// rounded value to 1..99 unless the underlying progress genuinely hits the endpoint.
export const displayProgressPct = (progress: number): number => {
    if (!Number.isFinite(progress) || progress <= 0) return 0;
    if (progress >= 100) return 100;
    return Math.min(99, Math.max(1, Math.round(progress)));
};


// Stats Page Calculations
export const calculateGlobalStats = (debts: Debt[], history: HistoryEntry[]) => {
    const paidByDebtId = new Map<string, number>();
    let totalTransportPaid = 0;
    for (const h of history) {
        if (h.type === 'payment' && h.debtId) {
            paidByDebtId.set(h.debtId, (paidByDebtId.get(h.debtId) ?? 0) + h.amount);
        } else if (h.type === 'transport') {
            totalTransportPaid += h.amount;
        }
    }
    const globalTotalDebt = debts.reduce((acc, d) => acc + d.total_owed, 0);
    // Raw money actually handed over — can exceed the total owed when a debt is overpaid.
    const globalAmountPaid = debts.reduce((acc, d) => acc + (paidByDebtId.get(d.id) ?? 0), 0);
    // Only what each debt could absorb counts toward progress. Without the per-debt clamp,
    // an overpayment on one debt silently cancels the shortfall on another, so the donut
    // reads "100% paid off" (and remaining goes negative) while a bar still sits at 83%.
    // This matches getRemainingBalance/getProgress, which already clamp per debt.
    const globalCreditedPaid = debts.reduce(
        (acc, d) => acc + Math.min(paidByDebtId.get(d.id) ?? 0, d.total_owed),
        0,
    );
    const globalOverpaid = globalAmountPaid - globalCreditedPaid;
    const globalRemainingBalance = globalTotalDebt - globalCreditedPaid;
    return {
        globalTotalDebt,
        globalAmountPaid,
        globalCreditedPaid,
        globalOverpaid,
        globalRemainingBalance,
        totalTransportPaid,
    };
};

/**
 * Canonical 'yyyy-MM-dd' key for a calendar day, in the user's LOCAL timezone.
 *
 * This used to be `day.toISOString().split('T')[0]`, which is a UTC date. For any
 * timezone east of UTC (SAST, the app's default currency's home, is UTC+2) local
 * midnight falls on the PREVIOUS UTC day, so every key was silently shifted back one
 * day. Reads and writes shifted together, so the calendar looked self-consistent — but
 * anything that compared a key against a locally-derived month ('yyyy-MM') did not:
 * an Uber ride logged on the 1st was keyed to the last day of the previous month and
 * counted in that month's spend, and the Uber day dialog re-parsed the key and titled
 * itself with yesterday's date. Local keys make the key mean what it reads as.
 *
 * Stored keys written under the old scheme are re-keyed once at load (see
 * migrateDayKeys in AppDataContext).
 */
export const dayKey = (day: Date): string => format(day, 'yyyy-MM-dd');

/** The pre-v9 UTC-derived key for a day. Only the load-time migration needs this. */
export const legacyUtcDayKey = (day: Date): string => day.toISOString().split('T')[0];

export function getDayState(day: Date, overrides: TransportOverrides): DayState {
  const override = overrides[dayKey(day)];
  if (override !== undefined) return override;
  return isWeekend(day) ? 0 : 1;
}

// NOTE (flagged, not yet changed — see plan Part D #7): employmentStartDate/EndDate are not
// consulted here, so days outside the employment window still bill as travel. A future change
// could return 0 for days before start / after end.

export function getEffectiveDayState(
  day: Date,
  overrides: TransportOverrides,
  employed: boolean,
  isFutureMonth: boolean
): DayState {
  const override = overrides[dayKey(day)];
  if (override !== undefined) return override;
  if (!employed && isFutureMonth) return 0;
  return isWeekend(day) ? 0 : 1;
}

// A fee can reach storage as NaN (a cleared number input parsed with parseFloat) or
// negative (typed with a minus). Either would poison every downstream total — the balance,
// the Stats snapshot and the sealed summary all read this figure — so both are normalised
// to 0 here rather than at each of the ~6 call sites.
const safeFee = (v: number | undefined) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);

// Transport Page Calculations
export const calculateTransportMonth = (
    currentDate: Date,
    overrides: TransportOverrides,
    settings: Pick<TransportSettings, 'dailyFee' | 'monthlyFee' | 'pricingMode' | 'employed'>,
    today: Date = new Date(),
    // Per-month flat-fee override for 'monthly' pricing. When provided it takes
    // priority over settings.monthlyFee so the balance reflects calendar edits live.
    monthlyOverride?: number,
) => {
    const monthStart = startOfMonth(currentDate);
    const daysInMonth = Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => add(monthStart, { days: i }));
    const isFutureMonth = startOfMonth(currentDate) > startOfMonth(today) && !isSameMonth(currentDate, today);

    let fullDaysCount = 0;
    let halfDaysCount = 0;

    daysInMonth.forEach(day => {
      const state = getEffectiveDayState(day, overrides, settings.employed, isFutureMonth);
      if (state === 1) fullDaysCount++;
      else if (state === 1.5) halfDaysCount++;
    });

    const travelDaysCount = fullDaysCount + halfDaysCount;
    const unemployedFuture = !settings.employed && isFutureMonth;
    const effectiveMonthlyFee = monthlyOverride !== undefined ? safeFee(monthlyOverride) : safeFee(settings.monthlyFee);
    const totalDue = unemployedFuture
      ? 0
      : settings.pricingMode === 'monthly'
        ? effectiveMonthlyFee
        : (fullDaysCount + halfDaysCount * 0.5) * safeFee(settings.dailyFee);

    return { daysInMonth, fullDaysCount, halfDaysCount, travelDaysCount, totalDue, isFutureMonth };
}

/**
 * Travel cost across an ARBITRARY window [start, endExclusive) — what the pay-cycle money
 * math uses. calculateTransportMonth above stays exactly as it was: it is the calendar
 * grid the Transport page draws, and a month is what that page means.
 *
 * Daily pricing simply prices every day in the window, so a cycle straddling two months
 * costs what those days cost. Flat ('monthly') pricing bills ONE fee per cycle — a flat
 * fee is per pay period, not per day — using the fee in force for the month the cycle
 * STARTS in, including that month's per-month override, since that is the month the user
 * was editing when the cycle began.
 *
 * With payDay 1 the window IS a calendar month and this returns what
 * calculateTransportMonth returns, by construction.
 */
export const calculateTransportRange = (
    start: Date,
    endExclusive: Date,
    overrides: TransportOverrides,
    settings: Pick<TransportSettings, 'dailyFee' | 'monthlyFee' | 'pricingMode' | 'employed'>,
    monthlyOverrides: TransportMonthlyOverrides = {},
    today: Date = new Date(),
) => {
    const todayMonth = startOfMonth(today);
    let fullDaysCount = 0;
    let halfDaysCount = 0;
    // Guard: a corrupt/inverted window must not spin here.
    for (let d = startOfDay(start), guard = 0; d < endExclusive && guard < 400; d = add(d, { days: 1 }), guard++) {
      const state = getEffectiveDayState(d, overrides, settings.employed, startOfMonth(d) > todayMonth);
      if (state === 1) fullDaysCount++;
      else if (state === 1.5) halfDaysCount++;
    }

    const startKey = format(start, 'yyyy-MM');
    const override = monthlyOverrides[startKey];
    const effectiveMonthlyFee = override !== undefined ? safeFee(override) : safeFee(settings.monthlyFee);
    const unemployedFuture = !settings.employed && startOfMonth(start) > todayMonth;
    const totalDue = unemployedFuture
      ? 0
      : settings.pricingMode === 'monthly'
        ? effectiveMonthlyFee
        : (fullDaysCount + halfDaysCount * 0.5) * safeFee(settings.dailyFee);

    return { fullDaysCount, halfDaysCount, travelDaysCount: fullDaysCount + halfDaysCount, totalDue };
}

/** The current cycle and the `back` cycles before it, newest first — what a "which cycle
 *  was this for?" picker offers. */
export function listRecentCycles(payDay: number, back = 11, from: Date = new Date()): PayCycle[] {
  const out: PayCycle[] = [];
  let cursor = cycleStart(from, payDay);
  for (let i = 0; i <= back; i++) {
    out.push(getPayCycle(payDay, cursor));
    cursor = payDateIn(cursor.getFullYear(), cursor.getMonth() - 1, payDay);
  }
  return out;
}

/** The label a 'yyyy-MM' cycle key reads as, for rows filed against a cycle that is no
 *  longer in the picker's range. */
export const cycleLabelFromKey = (key: string, payDay: number): string =>
  getPayCycle(payDay, cycleStartFromKey(key, payDay)).label;

// ─── Shared monthly money math ─────────────────────────────────────────────────
// One place that computes a month's income + outgoings so Balance, Stats, the
// transport status card and the month-end seal never drift apart.

/** 'yyyy-MM' month key for a date. */
export const getMonthKey = (date: Date): string => format(date, 'yyyy-MM');

// ─── Pay cycles ────────────────────────────────────────────────────────────────
// The money screens (Balance, Stats) and the seal used to run on the CALENDAR month, so
// everything reset on the 1st — a date that means nothing to someone paid on the 25th:
// the last five days of every month showed a balance already spent. A pay cycle runs pay
// date → day before the next pay date, so "Remaining" is what is left of the money that
// actually arrived, and the reset happens when the next pay lands.
//
// The day itself is userProfile.paydayDay, editable in Settings → Pay Date.
//
// Cycles are KEYED by the month they START in, so with payDay 1 a cycle IS its calendar
// month and every key already in storage (lastSnapshotMonth, transportMonthlyOverrides)
// keeps exactly the meaning it has today. Nothing needed migrating.

/** Pay day of month, guarded. Anything outside 1–31 (a cleared input that reached storage)
 *  falls back to 1, i.e. plain calendar months. */
export const normalizePayDay = (day: number | undefined | null): number => {
  const d = Math.trunc(Number(day));
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
};

/** The pay date inside one month, clamped to that month's length — a 31st pay day lands on
 *  the 30th (or 28th/29th) in shorter months, which is what banks do and what "the last
 *  day I can be paid in February" means. `monthIndex` may be −1 or 12; Date rolls the year. */
export function payDateIn(year: number, monthIndex: number, payDay: number): Date {
  const first = new Date(year, monthIndex, 1);
  return new Date(year, monthIndex, Math.min(normalizePayDay(payDay), getDaysInMonth(first)));
}

/** Start (inclusive, local midnight) of the pay cycle containing `date`. */
export function cycleStart(date: Date, payDay: number): Date {
  const thisMonths = payDateIn(date.getFullYear(), date.getMonth(), payDay);
  return startOfDay(date) >= thisMonths
    ? thisMonths
    : payDateIn(date.getFullYear(), date.getMonth() - 1, payDay);
}

/** Start of the cycle that follows the one beginning at `start`. */
export const nextCycleStart = (start: Date, payDay: number): Date =>
  payDateIn(start.getFullYear(), start.getMonth() + 1, payDay);

/** End (EXCLUSIVE) of the pay cycle containing `date` — i.e. the next pay date. */
export const cycleEnd = (date: Date, payDay: number): Date =>
  nextCycleStart(cycleStart(date, payDay), payDay);

/** 'yyyy-MM' key for the cycle containing `date`, labelled by the month it starts in. */
export const cycleKey = (date: Date, payDay: number): string =>
  format(cycleStart(date, payDay), 'yyyy-MM');

/** The cycle a 'yyyy-MM' key names, as its start date. */
export function cycleStartFromKey(key: string, payDay: number): Date {
  const [y, m] = key.split('-').map(Number);
  return payDateIn(y, m - 1, payDay);
}

/** Everything a screen needs to talk about one pay cycle. `end` is exclusive (the next pay
 *  date); `lastDay` is the last day the cycle actually covers, which is what labels read. */
export interface PayCycle {
  payDay: number;
  start: Date;
  end: Date;
  lastDay: Date;
  key: string;
  /** "26 Aug – 25 Sep 2026", or just "September 2026" when the cycle IS a calendar month. */
  label: string;
  /** Whole days from `date` until the next pay date. 0 on pay day itself. */
  daysLeft: number;
  /** 0–1 through the cycle, for a progress bar. */
  progress: number;
}

export function getPayCycle(payDay: number, date: Date = new Date()): PayCycle {
  const day = normalizePayDay(payDay);
  const start = cycleStart(date, day);
  const end = nextCycleStart(start, day);
  const lastDay = add(end, { days: -1 });
  const total = Math.max(1, differenceInCalendarDays(end, start));
  const elapsed = Math.min(total, Math.max(0, differenceInCalendarDays(startOfDay(date), start)));
  return {
    payDay: day,
    start,
    end,
    lastDay,
    key: format(start, 'yyyy-MM'),
    label: day === 1 ? format(start, 'MMMM yyyy') : `${format(start, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}`,
    daysLeft: Math.max(0, differenceInCalendarDays(end, startOfDay(date))),
    progress: elapsed / total,
  };
}

/** Whether "Mark as Paid" has been logged for the given month — the transport figure
 *  itself stays the calendar estimate either way; this only drives the "estimate" label. */
export const isTransportPaidForMonth = (history: HistoryEntry[], date: Date): boolean => {
  const monthLabel = format(date, 'MMMM yyyy');
  return history.some(h => h.type === 'transport' && h.debtTitle === `Transport: ${monthLabel}`);
};

/** Fields the cycle calculators read — a subset of AppState, plus the pay day (which lives
 *  on userProfile, so callers pass it explicitly rather than the whole profile). */
export interface MonthlyMoneyInput {
  /** userProfile.paydayDay — the day of month the cycle turns over on. */
  payDay: number;
  monthlyIncome: number;
  extraIncomes: ExtraIncome[];
  expenses: Expense[];
  budgetPlans: BudgetPlan[];
  history: HistoryEntry[];
  uberRides: UberRide[];
  savings: SavingEntry[];
  transportSettings: TransportSettings;
  transportOverrides: TransportOverrides;
  transportMonthlyOverrides: TransportMonthlyOverrides;
}

export interface MonthlyMoney {
  income: number;        // salary + extra income
  transport: number;     // driver cost (calendar/flat)
  uber: number;          // uber/ride spend
  debt: number;          // debt payments
  expenses: number;      // expense spend
  budget: number;        // budget item allocations
  savings: number;       // money deliberately put away this cycle (manual entries only)
  totalOutgoings: number;
  remaining: number;     // income − totalOutgoings
}

/** Timestamp for a stored date. A bare 'yyyy-MM-dd' day key (uber rides) is parsed as LOCAL
 *  midnight, not UTC: `new Date('2026-09-07')` is UTC midnight, which is the previous
 *  evening west of UTC and would drop a ride into the wrong cycle at a boundary. Full ISO
 *  stamps carry their own zone and parse normally. Same reasoning as `dayKey` above. */
const parseStamp = (date: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : new Date(date).getTime();
};

/** Whether a stored date string falls inside [start, end). */
const inWindow = (date: string, start: Date, end: Date): boolean => {
  const t = parseStamp(date);
  return t >= start.getTime() && t < end.getTime();
};

const sumInWindow = <T>(items: T[], start: Date, end: Date, dateOf: (i: T) => string, amountOf: (i: T) => number): number =>
  items.reduce((s, i) => (inWindow(dateOf(i), start, end) ? s + amountOf(i) : s), 0);

/**
 * Live money for the CURRENT pay cycle, read straight from the working arrays — this is
 * what Balance/Stats show and it reacts instantly to edits. Transport honours the
 * per-month flat-fee override. Expenses use the full active set (recurring + one-time),
 * matching what the user currently sees on their expenses list.
 *
 * `date` is any day inside the cycle you want (defaults to today); the window is derived
 * from it and the pay day, so with payDay 1 this is the calendar month it always was.
 */
export function calculateLiveMonthly(input: MonthlyMoneyInput, date: Date = new Date()): MonthlyMoney {
  const start = cycleStart(date, input.payDay);
  const end = nextCycleStart(start, input.payDay);
  const income = input.monthlyIncome + input.extraIncomes.reduce((s, e) => s + e.amount, 0);
  const transport = calculateTransportRange(
    start, end, input.transportOverrides, input.transportSettings, input.transportMonthlyOverrides, date,
  ).totalDue;
  const uber = sumInWindow(input.uberRides, start, end, r => r.date, r => r.price);
  const debt = sumInWindow(
    input.history.filter(h => h.type === 'payment' && !!h.debtId), start, end, h => h.date, h => h.amount);
  const expenses = input.expenses.reduce((s, e) => s + e.amount, 0);
  const budget = confirmedBudgetForWindow(input.budgetPlans, start, end);
  const savings = manualSavingsForCycle(input.savings, format(start, 'yyyy-MM'));
  const totalOutgoings = transport + uber + debt + expenses + budget + savings;
  return { income, transport, uber, debt, expenses, budget, savings, totalOutgoings, remaining: income - totalOutgoings };
}

// Budgets only hit the balance once the user confirms the plan (bought the items), and only for
// the cycle it was confirmed in. The deduction is the spent total (Σ item prices), not the budget
// ceiling — so an unspent remainder is never deducted.
/**
 * Money the user says they put away for a cycle, counted as an outgoing.
 *
 * Only MANUAL entries. An 'auto' entry is the leftover the cycle ENDED with — it is what
 * remains after every deduction, so deducting it as well would subtract the same money
 * twice and shrink the figure it was computed from.
 *
 * Matched on the entry's `cycleKey` — the cycle the user FILED it against — not on when
 * they happened to type it in. Recording last cycle's transfer today puts it in last
 * cycle, which is what picking that cycle in the form meant.
 */
const manualSavingsForCycle = (savings: SavingEntry[] | undefined, cycleKeyStr: string): number =>
  (savings ?? []).reduce((s, v) => (v.source === 'manual' && v.cycleKey === cycleKeyStr ? s + v.amount : s), 0);

const confirmedBudgetForWindow = (plans: BudgetPlan[], start: Date, end: Date): number =>
  plans.reduce(
    (s, p) => (p.confirmed && p.confirmedAt && inWindow(p.confirmedAt, start, end)
      ? s + p.items.reduce((si, i) => si + i.price, 0) : s), 0);

/**
 * Summary for a PAST (ended) pay cycle, reconstructed from dated stored data so it is
 * correct even after the working arrays have moved on (e.g. one-time expenses purged).
 * Best-effort: salary uses the current monthlyIncome (historical salary isn't stored).
 *
 * `cycleKeyStr` is the cycle's 'yyyy-MM' key — the month it STARTED in.
 */
export function calculateSealedCycleSummary(input: MonthlyMoneyInput, cycleKeyStr: string): MonthlyMoney {
  const start = cycleStartFromKey(cycleKeyStr, input.payDay);
  const end = nextCycleStart(start, input.payDay);
  // Transport solidifies the same calendar-computed figure the Balance tab showed all cycle
  // (the user's model: the live amount "solidifies via the snapshot"), rather than only
  // whatever happened to be marked paid — so the summary matches what was on screen.
  const transport = calculateTransportRange(
    start, end, input.transportOverrides, input.transportSettings, input.transportMonthlyOverrides, start,
  ).totalDue;
  const debt = sumInWindow(
    input.history.filter(h => h.type === 'payment' && !!h.debtId), start, end, h => h.date, h => h.amount);
  // One-time expenses live on as dated `expense` history entries even after purge.
  const oneTimeExpenses = sumInWindow(
    input.history.filter(h => h.type === 'expense'), start, end, h => h.date, h => h.amount);
  // Recurring expenses only get a single (creation-cycle) history entry, so add the current
  // recurring set for any cycle at/after their creation — except the creation cycle itself,
  // which is already covered by the history sum above (avoids double counting).
  const recurringExpenses = input.expenses
    .filter(e => e.recurring && new Date(e.createdAt) < end && !inWindow(e.createdAt, start, end))
    .reduce((s, e) => s + e.amount, 0);
  const expenses = oneTimeExpenses + recurringExpenses;
  const uber = sumInWindow(input.uberRides, start, end, r => r.date, r => r.price);
  const budget = confirmedBudgetForWindow(input.budgetPlans, start, end);
  // Manual savings for this cycle are an outgoing here too, which is what keeps the
  // automatic sweep honest: the leftover the seal banks is what was left AFTER them, so a
  // cycle's savings total is "what I put away" + "what I had left", never one twice.
  const savings = manualSavingsForCycle(input.savings, cycleKeyStr);
  // Recurring extras count for every cycle from creation onward; one-time extras only for
  // the cycle they were created in. Relies on the seal running BEFORE the purge removes
  // expired one-time extras (see load order in AppDataContext).
  const extra = input.extraIncomes.reduce((s, e) => {
    if (e.recurring) return new Date(e.createdAt) < end ? s + e.amount : s;
    return inWindow(e.createdAt, start, end) ? s + e.amount : s;
  }, 0);
  const income = input.monthlyIncome + extra;
  const totalOutgoings = transport + uber + debt + expenses + budget + savings;
  return { income, transport, uber, debt, expenses, budget, savings, totalOutgoings, remaining: income - totalOutgoings };
}
