import type {
  Debt, HistoryEntry, TransportOverrides, TransportSettings, DayState,
  Expense, ExtraIncome, BudgetPlan, UberRide, TransportMonthlyOverrides,
} from './types';
import { isWeekend, getDaysInMonth, startOfMonth, add, isSameMonth, format, endOfMonth } from 'date-fns';

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
    // A fee can reach storage as NaN (a cleared number input parsed with parseFloat) or
    // negative (typed with a minus). Either would poison every downstream total — the
    // month balance, the Stats snapshot and the sealed summary all read this figure — so
    // both are normalised to 0 here rather than at each of the ~6 call sites.
    const safeFee = (v: number | undefined) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);
    const effectiveMonthlyFee = monthlyOverride !== undefined ? safeFee(monthlyOverride) : safeFee(settings.monthlyFee);
    const totalDue = unemployedFuture
      ? 0
      : settings.pricingMode === 'monthly'
        ? effectiveMonthlyFee
        : (fullDaysCount + halfDaysCount * 0.5) * safeFee(settings.dailyFee);

    return { daysInMonth, fullDaysCount, halfDaysCount, travelDaysCount, totalDue, isFutureMonth };
}

// ─── Shared monthly money math ─────────────────────────────────────────────────
// One place that computes a month's income + outgoings so Balance, Stats, the
// transport status card and the month-end seal never drift apart.

/** 'yyyy-MM' month key for a date. */
export const getMonthKey = (date: Date): string => format(date, 'yyyy-MM');

/** Whether "Mark as Paid" has been logged for the given month — the transport figure
 *  itself stays the calendar estimate either way; this only drives the "estimate" label. */
export const isTransportPaidForMonth = (history: HistoryEntry[], date: Date): boolean => {
  const monthLabel = format(date, 'MMMM yyyy');
  return history.some(h => h.type === 'transport' && h.debtTitle === `Transport: ${monthLabel}`);
};

/** Fields the monthly calculators read — a subset of AppState. */
export interface MonthlyMoneyInput {
  monthlyIncome: number;
  extraIncomes: ExtraIncome[];
  expenses: Expense[];
  budgetPlans: BudgetPlan[];
  history: HistoryEntry[];
  uberRides: UberRide[];
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
  totalOutgoings: number;
  remaining: number;     // income − totalOutgoings
}

const sumInMonth = <T>(items: T[], monthKey: string, dateOf: (i: T) => string, amountOf: (i: T) => number): number =>
  items.reduce((s, i) => (getMonthKey(new Date(dateOf(i))) === monthKey ? s + amountOf(i) : s), 0);

/**
 * Live money for the CURRENT month, read straight from the working arrays — this is
 * what Balance/Stats show and it reacts instantly to edits. Transport honours the
 * per-month flat-fee override. Expenses use the full active set (recurring + one-time),
 * matching what the user currently sees on their expenses list.
 */
export function calculateLiveMonthly(input: MonthlyMoneyInput, date: Date = new Date()): MonthlyMoney {
  const monthKey = getMonthKey(date);
  const income = input.monthlyIncome + input.extraIncomes.reduce((s, e) => s + e.amount, 0);
  const transport = calculateTransportMonth(
    date, input.transportOverrides, input.transportSettings, date, input.transportMonthlyOverrides[monthKey],
  ).totalDue;
  const uber = input.uberRides.reduce((s, r) => (r.date.slice(0, 7) === monthKey ? s + r.price : s), 0);
  const debt = input.history.reduce(
    (s, h) => (h.type === 'payment' && h.debtId && getMonthKey(new Date(h.date)) === monthKey ? s + h.amount : s), 0);
  const expenses = input.expenses.reduce((s, e) => s + e.amount, 0);
  const budget = confirmedBudgetForMonth(input.budgetPlans, monthKey);
  const totalOutgoings = transport + uber + debt + expenses + budget;
  return { income, transport, uber, debt, expenses, budget, totalOutgoings, remaining: income - totalOutgoings };
}

// Budgets only hit the balance once the user confirms the plan (bought the items), and only for
// the month it was confirmed. The deduction is the spent total (Σ item prices), not the budget
// ceiling — so an unspent remainder is never deducted.
const confirmedBudgetForMonth = (plans: BudgetPlan[], monthKey: string): number =>
  plans.reduce(
    (s, p) => (p.confirmed && p.confirmedAt && getMonthKey(new Date(p.confirmedAt)) === monthKey
      ? s + p.items.reduce((si, i) => si + i.price, 0) : s), 0);

/**
 * Summary for a PAST (ended) month, reconstructed from month-dated stored data so it is
 * correct even after the working arrays have moved on (e.g. one-time expenses purged).
 * Best-effort: salary uses the current monthlyIncome (historical salary isn't stored).
 */
export function calculateSealedMonthSummary(input: MonthlyMoneyInput, monthKey: string): MonthlyMoney {
  const monthDate = new Date(`${monthKey}-01T00:00:00`);
  const monthEnd = endOfMonth(monthDate);
  // Transport solidifies the same calendar-computed figure the Balance tab showed all month
  // (the user's model: the live amount "solidifies via the month-end snapshot"), rather than
  // only whatever happened to be marked paid — so the summary matches what was on screen.
  const transport = calculateTransportMonth(
    monthDate, input.transportOverrides, input.transportSettings, monthDate, input.transportMonthlyOverrides[monthKey],
  ).totalDue;
  const debt = sumInMonth(input.history.filter(h => h.type === 'payment' && !!h.debtId), monthKey, h => h.date, h => h.amount);
  // One-time expenses live on as month-dated `expense` history entries even after purge.
  const oneTimeExpenses = sumInMonth(input.history.filter(h => h.type === 'expense'), monthKey, h => h.date, h => h.amount);
  // Recurring expenses only get a single (creation-month) history entry, so add the current
  // recurring set for any month at/after their creation — except the creation month itself,
  // which is already covered by the history sum above (avoids double counting).
  const recurringExpenses = input.expenses
    .filter(e => e.recurring && new Date(e.createdAt) <= monthEnd && getMonthKey(new Date(e.createdAt)) !== monthKey)
    .reduce((s, e) => s + e.amount, 0);
  const expenses = oneTimeExpenses + recurringExpenses;
  const uber = input.uberRides.reduce((s, r) => (r.date.slice(0, 7) === monthKey ? s + r.price : s), 0);
  const budget = confirmedBudgetForMonth(input.budgetPlans, monthKey);
  // Recurring extras count for every month from creation onward; one-time extras only for
  // their creation month. Relies on the seal running BEFORE the monthly purge removes
  // expired one-time extras (see load order in AppDataContext).
  const extra = input.extraIncomes.reduce((s, e) => {
    const created = getMonthKey(new Date(e.createdAt));
    if (e.recurring) return created <= monthKey ? s + e.amount : s;
    return created === monthKey ? s + e.amount : s;
  }, 0);
  const income = input.monthlyIncome + extra;
  const totalOutgoings = transport + uber + debt + expenses + budget;
  return { income, transport, uber, debt, expenses, budget, totalOutgoings, remaining: income - totalOutgoings };
}
