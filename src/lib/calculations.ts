import type { Debt, HistoryEntry, TransportOverrides, TransportSettings, DayState } from './types';
import { isWeekend, getDaysInMonth, startOfMonth, add, isSameMonth } from 'date-fns';

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
    const globalTotalDebt = debts.reduce((acc, debt) => acc + debt.total_owed, 0);
    const globalAmountPaid = debts.reduce((acc, debt) => acc + getAmountPaid(debt, history), 0);
    const globalRemainingBalance = globalTotalDebt - globalAmountPaid;
    const totalTransportPaid = history
      .filter((item) => item.type === 'transport')
      .reduce((acc, item) => acc + item.amount, 0);
    
    return { globalTotalDebt, globalAmountPaid, globalRemainingBalance, totalTransportPaid };
};

export function getDayState(day: Date, overrides: TransportOverrides): DayState {
  const isoDate = day.toISOString().split('T')[0];
  const override = overrides[isoDate];
  if (override !== undefined) return override;
  return isWeekend(day) ? 0 : 1;
}

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
    today: Date = new Date()
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
    const totalDue = unemployedFuture
      ? 0
      : settings.pricingMode === 'monthly'
        ? (settings.monthlyFee || 0)
        : (fullDaysCount + halfDaysCount * 0.5) * (settings.dailyFee || 0);

    return { daysInMonth, fullDaysCount, halfDaysCount, travelDaysCount, totalDue, isFutureMonth };
}
