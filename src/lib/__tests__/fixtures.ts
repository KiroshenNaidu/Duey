import type { AppState, Loan } from '../types';
import type { MonthlyMoneyInput } from '../calculations';
import { defaultPiggybanks } from '../piggybanks';

/**
 * Test data shaped like a real month: the numbers from the Balance screen on 26 Sep 2026.
 *
 *   Pay day 30, so the cycle is 30 Aug to 29 Sep 2026 (key '2026-08').
 *   Income 6500. Transport 1800 (flat monthly fee), Uber 182, debt payment 60,
 *   rent 3739, R50 lent to Sam. Remaining: 669.
 *
 * Dates are built with local-time constructors so the tests pass in any time zone.
 */

/** A local date as the ISO string the app stores. Month is 1-12 here, like a calendar. */
export const iso = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

/** A local date. Month is 1-12. */
export const day = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);

export const sam = (events: Loan['events']): Loan => ({
  id: 'loan-sam', person: 'Sam', createdAt: iso(2026, 9, 10), events,
});

export function screenshotInput(overrides: Partial<MonthlyMoneyInput> = {}): MonthlyMoneyInput {
  return {
    payDay: 30,
    monthlyIncome: 6500,
    extraIncomes: [],
    expenses: [{ id: 'rent', title: 'Rent', amount: 3739, date: iso(2026, 9, 1), createdAt: iso(2026, 9, 1), recurring: true }],
    budgetPlans: [],
    history: [
      { id: 'pay-1', debtId: 'phone', debtTitle: 'Phone', type: 'payment', amount: 60, date: iso(2026, 9, 5) },
      { id: 'rent-log', debtTitle: 'Rent', type: 'expense', amount: 3739, date: iso(2026, 9, 1), expenseId: 'rent' },
    ],
    uberRides: [{ id: 'u1', date: '2026-09-06', price: 182, createdAt: iso(2026, 9, 6) }],
    savings: [],
    recurringSavings: [],
    loans: [sam([{ id: 'e1', type: 'lent', amount: 50, date: '2026-09-10', createdAt: iso(2026, 9, 10) }])],
    transportSettings: { driverName: 'Driver', employed: true, pricingMode: 'monthly', dailyFee: 0, monthlyFee: 1800 },
    transportOverrides: {},
    transportMonthlyOverrides: {},
    ...overrides,
  };
}

/** A whole app state around the same month, for the cycle-end tests. */
export function screenshotState(overrides: Partial<AppState> = {}): AppState {
  const input = screenshotInput();
  return {
    schemaVersion: 10,
    currency: 'ZAR',
    debts: [{ id: 'phone', title: 'Phone', total_owed: 1200, installment_amount: 60 }],
    history: input.history,
    expenses: input.expenses,
    extraIncomes: input.extraIncomes,
    budgetPlans: input.budgetPlans,
    uberRides: input.uberRides,
    savings: [],
    piggybanks: defaultPiggybanks(iso(2026, 8, 1)),
    recurringSavings: [],
    loans: input.loans,
    incomeHistory: [],
    monthlyIncome: input.monthlyIncome,
    transportSettings: input.transportSettings,
    transportOverrides: {},
    transportMonthlyOverrides: {},
    userProfile: { name: 'Test', paydayDay: 30, bio: '' },
    lastSnapshotMonth: '2026-08',
    ...overrides,
  } as unknown as AppState;
}
