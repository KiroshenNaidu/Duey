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
    if (debt.installment_amount <= 0) return 0;
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
    const globalAmountPaid = debts.reduce((acc, d) => acc + (paidByDebtId.get(d.id) ?? 0), 0);
    const globalRemainingBalance = globalTotalDebt - globalAmountPaid;
    return { globalTotalDebt, globalAmountPaid, globalRemainingBalance, totalTransportPaid };
};

// NOTE (flagged, not yet changed — see plan Part D #8): the ISO key below is derived
// in UTC (`toISOString`), so for UTC+ timezones a day can round to the previous calendar
// day. It round-trips consistently with how overrides are written, but is risky at month
// boundaries; a future change should switch to local `format(day, 'yyyy-MM-dd')` behind a
// key migration for existing stored overrides.
export function getDayState(day: Date, overrides: TransportOverrides): DayState {
  const isoDate = day.toISOString().split('T')[0];
  const override = overrides[isoDate];
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
  const isoDate = day.toISOString().split('T')[0];
  const override = overrides[isoDate];
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
    const effectiveMonthlyFee = monthlyOverride !== undefined ? monthlyOverride : (settings.monthlyFee || 0);
    const totalDue = unemployedFuture
      ? 0
      : settings.pricingMode === 'monthly'
        ? effectiveMonthlyFee
        : (fullDaysCount + halfDaysCount * 0.5) * (settings.dailyFee || 0);

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
